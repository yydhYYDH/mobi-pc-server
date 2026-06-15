import os
import socket
import subprocess
import time
from datetime import datetime
from pathlib import Path

from app.core.paths import LOGS_DIR, REPO_ROOT
from app.schemas.mnn import InferenceBackend, MnnStatus
from app.services.llama_cpp_server import LlamaCppServerAdapter
from app.services.modelscope import ModelScopeService


DEFAULT_MNN_PORT = 8088
DEFAULT_MOBIINFER_PORT = 8089
DEFAULT_LLAMA_CPP_PORT = 8090
MNN_LOG_FILE = "mnncli.log"
MOBIINFER_LOG_FILE = "mobiinfer.log"
LLAMA_CPP_LOG_FILE = "llama-server.log"

BACKEND_LABELS: dict[InferenceBackend, str] = {
    "mnn": "MNN",
    "mobiinfer": "MobiInfer",
    "llama_cpp": "llama.cpp",
}

BACKEND_LOG_FILES: dict[InferenceBackend, str] = {
    "mnn": MNN_LOG_FILE,
    "mobiinfer": MOBIINFER_LOG_FILE,
    "llama_cpp": LLAMA_CPP_LOG_FILE,
}

BACKEND_PORTS: dict[InferenceBackend, int] = {
    "mnn": DEFAULT_MNN_PORT,
    "mobiinfer": DEFAULT_MOBIINFER_PORT,
    "llama_cpp": DEFAULT_LLAMA_CPP_PORT,
}

BACKEND_RUNTIME_COMPATIBILITY: dict[InferenceBackend, set[InferenceBackend]] = {
    "mnn": {"mnn", "mobiinfer"},
    "mobiinfer": {"mnn", "mobiinfer"},
    "llama_cpp": {"llama_cpp"},
}


class MnnServerService:
    def __init__(self) -> None:
        self._status = MnnStatus(state="stopped", backend="mnn")
        self._process: subprocess.Popen[str] | None = None
        self._llama_cpp = LlamaCppServerAdapter()
        self._models = ModelScopeService()

    def status(self, backend: InferenceBackend | None = None) -> MnnStatus:
        if backend and not (self._process and self._process.poll() is None):
            self._status.backend = backend
        if self._process and self._process.poll() is not None:
            backend = self._status.backend
            label = BACKEND_LABELS[backend]
            self._append_log(backend, f"{label} process exited with code {self._process.returncode}.")
            self._status = MnnStatus(
                state="error",
                backend=backend,
                active_model_id=self._status.active_model_id,
                port=self._status.port,
                message=f"{label} exited with code {self._process.returncode}.",
            )
            self._process = None
        if self._process and self._process.poll() is None:
            self._status.managed_by_backend = True
            return self._status
        if self._is_port_open(self._status.port or BACKEND_PORTS[self._status.backend]):
            return MnnStatus(
                state="running",
                backend=self._status.backend,
                active_model_id=self._status.active_model_id,
                port=self._status.port or BACKEND_PORTS[self._status.backend],
                message=f"Detected an existing {BACKEND_LABELS[self._status.backend]}-compatible service on this port.",
                managed_by_backend=False,
            )
        return self._status

    def start(self) -> MnnStatus:
        if self._status.active_model_id:
            self._append_log(
                self._status.backend,
                f"Restart requested for model {self._status.active_model_id}.",
            )
            return self.load_model(self._status.active_model_id, self._status.backend)

        self._append_log(self._status.backend, "Start requested without an active model.")
        self._status = MnnStatus(
            state="error",
            backend=self._status.backend,
            message=f"Load a model before starting {BACKEND_LABELS[self._status.backend]} server.",
        )
        return self._status

    def stop(self) -> MnnStatus:
        backend = self._status.backend
        label = BACKEND_LABELS[backend]
        if self._process and self._process.poll() is None:
            self._append_log(backend, f"Stopping managed {label} process pid={self._process.pid}.")
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
                self._append_log(backend, f"{label} process stopped with code {self._process.returncode}.")
            except subprocess.TimeoutExpired:
                self._append_log(backend, f"{label} did not stop within 10s; killing process.")
                self._process.kill()
                self._process.wait(timeout=5)
                self._append_log(backend, f"{label} process killed with code {self._process.returncode}.")

        self._process = None
        if self._is_port_open(self._status.port or BACKEND_PORTS[backend]):
            self._append_log(
                backend,
                f"Port {self._status.port or BACKEND_PORTS[backend]} is still open after stop; treating as external service.",
            )
            self._status = MnnStatus(
                state="running",
                backend=backend,
                active_model_id=self._status.active_model_id,
                port=self._status.port or BACKEND_PORTS[backend],
                message=f"{label} service is online, but it was not started by this backend.",
                managed_by_backend=False,
            )
            return self._status

        self._append_log(backend, f"{label} service stopped.")
        self._status = MnnStatus(state="stopped", backend=backend)
        return self._status

    def load_model(self, model_id: str, backend: InferenceBackend = "mnn") -> MnnStatus:
        self._append_log(backend, f"Load model requested: {model_id}.")
        entry_path = self._models.entry_path(model_id)
        runtime = self._normalize_runtime(self._models.runtime(model_id))
        if runtime not in BACKEND_RUNTIME_COMPATIBILITY[backend]:
            label = BACKEND_LABELS[backend]
            compatible = ", ".join(BACKEND_LABELS[item] for item in sorted(BACKEND_RUNTIME_COMPATIBILITY[backend]))
            self._status = MnnStatus(
                state="error",
                backend=backend,
                active_model_id=model_id,
                message=(
                    f"Model {model_id} is configured for {BACKEND_LABELS[runtime]}. "
                    f"{label} accepts: {compatible}."
                ),
            )
            return self._status

        binary_path = self._find_backend_binary(backend)
        if not binary_path:
            label = BACKEND_LABELS[backend]
            self._append_log(backend, f"{label} binary was not found.")
            self._status = MnnStatus(
                state="error",
                backend=backend,
                active_model_id=model_id,
                message=self._missing_binary_message(backend),
            )
            return self._status

        self.stop()
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        port = BACKEND_PORTS[backend]
        if self._is_port_open(port):
            self._status = MnnStatus(
                state="error",
                backend=backend,
                active_model_id=model_id,
                port=port,
                message=(
                    f"Port {port} is already in use. Stop the existing "
                    f"{BACKEND_LABELS[backend]} service before loading a new model."
                ),
            )
            self._append_log(backend, self._status.message)
            return self._status

        command = self._build_command(backend, binary_path, model_id, entry_path, port)
        log_file = (LOGS_DIR / BACKEND_LOG_FILES[backend]).open("a", encoding="utf-8")
        self._append_log(
            backend,
            f"Starting {BACKEND_LABELS[backend]}: binary={binary_path} model={model_id} "
            f"entry={entry_path} host=127.0.0.1 port={port}",
        )
        self._append_log(backend, f"Working directory: {REPO_ROOT}")
        self._process = subprocess.Popen(
            command,
            cwd=str(REPO_ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self._append_log(backend, f"{BACKEND_LABELS[backend]} process created pid={self._process.pid}.")

        time.sleep(0.6)
        if self._process.poll() is not None:
            self._append_log(
                backend,
                f"{BACKEND_LABELS[backend]} exited during startup with code {self._process.returncode}.",
            )
            self._status = MnnStatus(
                state="error",
                backend=backend,
                active_model_id=model_id,
                port=port,
                message=(
                    f"{BACKEND_LABELS[backend]} exited during startup with code {self._process.returncode}. "
                    f"Check logs/{BACKEND_LOG_FILES[backend]}."
                ),
            )
            self._process = None
            return self._status

        self._append_log(backend, f"{BACKEND_LABELS[backend]} startup check passed on port {port}.")
        self._status = MnnStatus(
            state="running",
            backend=backend,
            active_model_id=model_id,
            port=port,
            message=f"Started {BACKEND_LABELS[backend]} server for {model_id}.",
            managed_by_backend=True,
        )
        return self._status

    def _append_log(self, backend: InferenceBackend, message: str) -> None:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
        with (LOGS_DIR / BACKEND_LOG_FILES[backend]).open("a", encoding="utf-8") as file:
            file.write(f"[pc-server] {timestamp} {message}\n")

    def _is_port_open(self, port: int) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return True
        except OSError:
            return False

    def _build_command(
        self,
        backend: InferenceBackend,
        binary_path: Path,
        model_id: str,
        entry_path: Path,
        port: int,
    ) -> list[str]:
        if backend == "llama_cpp":
            return self._llama_cpp.build_command(binary_path, entry_path, port)

        return [
            str(binary_path),
            "serve",
            model_id,
            "--config",
            str(entry_path),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ]

    def _normalize_runtime(self, runtime: str) -> InferenceBackend:
        if runtime in {"llama_cpp", "llama.cpp"}:
            return "llama_cpp"
        if runtime == "mobiinfer":
            return "mobiinfer"
        return "mnn"

    def _find_backend_binary(self, backend: InferenceBackend) -> Path | None:
        if backend == "llama_cpp":
            return self._llama_cpp.find_binary()
        if backend == "mobiinfer":
            return self._find_mobiinfer()
        return self._find_mnncli()

    def _find_mnncli(self) -> Path | None:
        env_path = os.environ.get("MNNCLI_BIN")
        if env_path:
            path = Path(env_path).expanduser().resolve()
            return path if path.exists() else None

        candidates = [
            REPO_ROOT / "3rdparty/MNN/apps/mnncli/build_mnncli/mnncli",
            REPO_ROOT / "3rdparty/MNN/apps/mnncli/build_mnncli/mnncli.exe",
            REPO_ROOT / "3rdparty/MNN/apps/mnncli/build/mnncli",
            REPO_ROOT / "3rdparty/MNN/apps/mnncli/build/mnncli.exe",
            REPO_ROOT / "3rdparty/MNN/build/apps/mnncli/mnncli",
            REPO_ROOT / "3rdparty/MNN/build/apps/mnncli/mnncli.exe",
        ]
        for path in candidates:
            if path.exists():
                return path
        return None

    def _find_mobiinfer(self) -> Path | None:
        env_path = os.environ.get("MOBIINFER_BIN")
        if env_path:
            path = Path(env_path).expanduser().resolve()
            return path if path.exists() else None

        candidates = [
            REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli",
            REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli.exe",
            REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build/mnncli",
            REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build/mnncli.exe",
            REPO_ROOT / "3rdparty/mobiinfer/build/apps/mnncli/mnncli",
            REPO_ROOT / "3rdparty/mobiinfer/build/apps/mnncli/mnncli.exe",
            REPO_ROOT / "desktop/resources/mobiinfer/mnncli",
            REPO_ROOT / "desktop/resources/mobiinfer/mnncli.exe",
        ]
        for path in candidates:
            if path.exists():
                return path
        return None

    def _missing_binary_message(self, backend: InferenceBackend) -> str:
        if backend == "llama_cpp":
            return self._llama_cpp.missing_binary_message()
        if backend == "mobiinfer":
            return (
                "MobiInfer binary was not found. Set MOBIINFER_BIN or build "
                "3rdparty/mobiinfer/apps/mnncli."
            )
        return (
            "mnncli binary was not found. Set MNNCLI_BIN or build "
            "3rdparty/MNN/apps/mnncli."
        )
