import os
import platform
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Literal

from app.core.paths import LOGS_DIR, REPO_ROOT, RESOURCES_DIR
from app.schemas.mnn import InferenceBackend, MnnStatus
from app.services.llama_cpp_server import LlamaCppRuntime, LlamaCppServerAdapter
from app.services.logs import LLM_SERVER_LOG, LogService
from app.services.modelscope import ModelScopeService


DEFAULT_MOBIINFER_PORT = 8089
DEFAULT_LLAMA_CPP_PORT = 8090
ModelRuntime = Literal["mnn", "mobiinfer", "llama_cpp"]

BACKEND_LABELS: dict[InferenceBackend, str] = {
    "mobiinfer": "MobiInfer",
    "llama_cpp": "llama.cpp",
    "llama_cpp_cuda": "llama.cpp CUDA",
    "llama_cpp_cpu": "llama.cpp CPU",
}
MODEL_RUNTIME_LABELS: dict[ModelRuntime, str] = {
    "mnn": "MNN-compatible",
    "mobiinfer": "MobiInfer",
    "llama_cpp": "llama.cpp",
}

BACKEND_PORTS: dict[InferenceBackend, int] = {
    "mobiinfer": DEFAULT_MOBIINFER_PORT,
    "llama_cpp": DEFAULT_LLAMA_CPP_PORT,
    "llama_cpp_cuda": DEFAULT_LLAMA_CPP_PORT,
    "llama_cpp_cpu": DEFAULT_LLAMA_CPP_PORT,
}
PORT_SEARCH_LIMIT = 40

BACKEND_RUNTIME_COMPATIBILITY: dict[InferenceBackend, set[ModelRuntime]] = {
    "mobiinfer": {"mnn", "mobiinfer"},
    "llama_cpp": {"llama_cpp"},
    "llama_cpp_cuda": {"llama_cpp"},
    "llama_cpp_cpu": {"llama_cpp"},
}


class MnnServerService:
    def __init__(self) -> None:
        self._status = MnnStatus(state="stopped", backend="llama_cpp")
        self._process: subprocess.Popen[str] | None = None
        self._llama_cpp = LlamaCppServerAdapter()
        self._models = ModelScopeService()
        self._logs = LogService()

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
            if self._status.state == "starting":
                if self._runtime_ready(self._status.backend, self._status.port):
                    self._append_log(
                        self._status.backend,
                        f"{BACKEND_LABELS[self._status.backend]} model is ready on port {self._status.port}.",
                    )
                    self._status = MnnStatus(
                        state="running",
                        backend=self._status.backend,
                        active_model_id=self._status.active_model_id,
                        port=self._status.port,
                        message=f"{BACKEND_LABELS[self._status.backend]} model is ready.",
                        managed_by_backend=True,
                    )
                else:
                    self._status.managed_by_backend = True
                    return self._status
            self._status.managed_by_backend = True
            return self._status
        port = self._status.port or BACKEND_PORTS[self._status.backend]
        if self._is_port_open(port):
            if self._status.state != "running" or self._status.managed_by_backend is not False:
                self._append_log(
                    self._status.backend,
                    (
                        f"Detected an existing {BACKEND_LABELS[self._status.backend]}-compatible "
                        f"service on port {port}. Its stdout/stderr are not managed by PC Server."
                    ),
                )
            self._status = MnnStatus(
                state="running",
                backend=self._status.backend,
                active_model_id=self._status.active_model_id,
                port=port,
                message=f"Detected an existing {BACKEND_LABELS[self._status.backend]}-compatible service on this port.",
                managed_by_backend=False,
            )
            return self._status
        if self._status.state == "running" and self._status.managed_by_backend is False:
            self._append_log(
                self._status.backend,
                f"External {BACKEND_LABELS[self._status.backend]} service on port {port} is no longer reachable.",
            )
            self._status = MnnStatus(state="stopped", backend=self._status.backend)
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
        port = self._status.port or BACKEND_PORTS[backend]
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
        if self._is_port_open(port) and self._stop_known_runtime_on_port(backend, port):
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if not self._is_port_open(port):
                    break
                time.sleep(0.2)

        if self._is_port_open(port):
            self._append_log(
                backend,
                f"Port {port} is still open after stop; treating as external service.",
            )
            self._status = MnnStatus(
                state="running",
                backend=backend,
                active_model_id=self._status.active_model_id,
                port=port,
                message=f"{label} service is online, but it was not started by this backend.",
                managed_by_backend=False,
            )
            return self._status

        self._append_log(backend, f"{label} service stopped.")
        self._status = MnnStatus(state="stopped", backend=backend)
        return self._status

    def load_model(self, model_id: str, backend: InferenceBackend = "llama_cpp") -> MnnStatus:
        self._append_log(backend, f"Load model requested: {model_id}.")
        entry_path = self._models.entry_path(model_id)
        mmproj_path = self._models.mmproj_path(model_id) if backend in {"llama_cpp", "llama_cpp_cuda", "llama_cpp_cpu"} else None
        runtime = self._normalize_runtime(self._models.runtime(model_id))
        if runtime not in BACKEND_RUNTIME_COMPATIBILITY[backend]:
            label = BACKEND_LABELS[backend]
            compatible = ", ".join(
                MODEL_RUNTIME_LABELS[item] for item in sorted(BACKEND_RUNTIME_COMPATIBILITY[backend])
            )
            self._status = MnnStatus(
                state="error",
                backend=backend,
                active_model_id=model_id,
                message=(
                    f"Model {model_id} is configured for {MODEL_RUNTIME_LABELS[runtime]}. "
                    f"{label} accepts: {compatible}."
                ),
            )
            return self._status

        runtime = self._find_backend_runtime(backend)
        if not runtime:
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
        port = self._select_port(backend)
        if port is None:
            default_port = BACKEND_PORTS[backend]
            self._status = MnnStatus(
                state="error",
                backend=backend,
                active_model_id=model_id,
                port=default_port,
                message=(
                    f"No free local port was found for {BACKEND_LABELS[backend]} "
                    f"from {default_port} to {default_port + PORT_SEARCH_LIMIT}."
                ),
            )
            self._append_log(backend, self._status.message)
            return self._status

        command = self._build_command(backend, runtime, model_id, entry_path, port, mmproj_path)
        log_file = (LOGS_DIR / LLM_SERVER_LOG).open("a", encoding="utf-8", errors="replace")
        binary_path = runtime.binary_path if isinstance(runtime, LlamaCppRuntime) else runtime
        runtime_label = f" runtime={runtime.accelerator}" if isinstance(runtime, LlamaCppRuntime) else ""
        self._append_log(
            backend,
            f"Starting {BACKEND_LABELS[backend]}:{runtime_label} binary={binary_path} model={model_id} "
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

        self._status = MnnStatus(
            state="starting",
            backend=backend,
            active_model_id=model_id,
            port=port,
            message=f"{BACKEND_LABELS[backend]} is loading model {model_id}.",
            managed_by_backend=True,
        )

        ready = self._wait_until_runtime_ready(backend, port)
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
                    f"Check logs/{LLM_SERVER_LOG}."
                ),
            )
            self._process = None
            return self._status

        if ready:
            self._append_log(backend, f"{BACKEND_LABELS[backend]} model is ready on port {port}.")
            self._status = MnnStatus(
                state="running",
                backend=backend,
                active_model_id=model_id,
                port=port,
                message=f"{BACKEND_LABELS[backend]} model is ready.",
                managed_by_backend=True,
            )
        else:
            self._append_log(backend, f"{BACKEND_LABELS[backend]} is still loading model on port {port}.")
        return self._status

    def _append_log(self, backend: InferenceBackend, message: str) -> None:
        self._logs.append(LLM_SERVER_LOG, f"[{BACKEND_LABELS[backend]}] {message}")

    def _is_port_open(self, port: int) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return True
        except OSError:
            return False

    def _select_port(self, backend: InferenceBackend) -> int | None:
        default_port = BACKEND_PORTS[backend]
        for offset in range(PORT_SEARCH_LIMIT + 1):
            port = default_port + offset
            if not self._is_port_open(port):
                if port != default_port:
                    self._append_log(
                        backend,
                        f"Default port {default_port} is occupied; using free port {port}.",
                    )
                return port
        return None

    def _stop_known_runtime_on_port(self, backend: InferenceBackend, port: int) -> bool:
        pids = self._pids_listening_on_port(port)
        if not pids:
            return False

        stopped = False
        for pid in pids:
            if not self._is_known_runtime_process(backend, pid):
                self._append_log(
                    backend,
                    f"Port {port} is owned by pid={pid}, but it does not look like a managed runtime; leaving it running.",
                )
                continue
            self._append_log(backend, f"Stopping orphaned {BACKEND_LABELS[backend]} process pid={pid} on port {port}.")
            if self._terminate_pid(pid):
                stopped = True
        return stopped

    def _pids_listening_on_port(self, port: int) -> list[int]:
        if platform.system() == "Windows":
            return self._windows_pids_listening_on_port(port)
        return self._procfs_pids_listening_on_port(port)

    def _windows_pids_listening_on_port(self, port: int) -> list[int]:
        try:
            result = subprocess.run(
                ["netstat", "-ano", "-p", "tcp"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return []

        pids: set[int] = set()
        port_suffix = f":{port}"
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) < 5 or parts[0].upper() != "TCP":
                continue
            local_address = parts[1]
            state = parts[3].upper()
            if state != "LISTENING" or not local_address.endswith(port_suffix):
                continue
            try:
                pids.add(int(parts[-1]))
            except ValueError:
                continue
        return sorted(pids)

    def _procfs_pids_listening_on_port(self, port: int) -> list[int]:
        proc_root = Path("/proc")
        if not proc_root.exists():
            return []

        inodes: set[str] = set()
        for path in (Path("/proc/net/tcp"), Path("/proc/net/tcp6")):
            if not path.exists():
                continue
            try:
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[1:]
            except OSError:
                continue
            for line in lines:
                parts = line.split()
                if len(parts) < 10 or parts[3] != "0A":
                    continue
                try:
                    local_port = int(parts[1].rsplit(":", 1)[1], 16)
                except (IndexError, ValueError):
                    continue
                if local_port == port:
                    inodes.add(parts[9])

        pids: set[int] = set()
        if not inodes:
            return []
        for proc_dir in proc_root.iterdir():
            if not proc_dir.name.isdigit():
                continue
            fd_dir = proc_dir / "fd"
            try:
                for fd in fd_dir.iterdir():
                    try:
                        target = os.readlink(fd)
                    except OSError:
                        continue
                    if target.startswith("socket:[") and target[8:-1] in inodes:
                        pids.add(int(proc_dir.name))
                        break
            except OSError:
                continue
        return sorted(pids)

    def _is_known_runtime_process(self, backend: InferenceBackend, pid: int) -> bool:
        command_line = self._process_command_line(pid).lower()
        if not command_line:
            return False
        if backend in {"llama_cpp", "llama_cpp_cuda", "llama_cpp_cpu"}:
            return "llama-server" in command_line or "llama.cpp" in command_line or "llama-cpp" in command_line
        return "mobiinfer" in command_line or "mnncli" in command_line

    def _process_command_line(self, pid: int) -> str:
        if platform.system() == "Windows":
            command = (
                f"Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}' "
                "| Select-Object -ExpandProperty CommandLine"
            )
            try:
                result = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", command],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=False,
                )
            except (OSError, subprocess.TimeoutExpired):
                return ""
            return result.stdout.strip()

        cmdline = Path("/proc") / str(pid) / "cmdline"
        try:
            return cmdline.read_bytes().replace(b"\x00", b" ").decode("utf-8", errors="replace").strip()
        except OSError:
            return ""

    def _terminate_pid(self, pid: int) -> bool:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            return False
        return True

    def _wait_until_runtime_ready(self, backend: InferenceBackend, port: int) -> bool:
        deadline = time.monotonic() + float(os.environ.get("LLM_STARTUP_READY_TIMEOUT", "90"))
        while time.monotonic() < deadline:
            if self._process and self._process.poll() is not None:
                return False
            if self._runtime_ready(backend, port):
                return True
            time.sleep(0.5)
        return False

    def _runtime_ready(self, backend: InferenceBackend, port: int | None) -> bool:
        if not port:
            return False
        if backend in {"llama_cpp", "llama_cpp_cuda", "llama_cpp_cpu"}:
            return self._llama_cpp_ready(port)
        return self._http_health_ready(port)

    def _http_health_ready(self, port: int) -> bool:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.5) as response:
                return response.status == 200
        except Exception:
            return False

    def _llama_cpp_ready(self, port: int) -> bool:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.5) as response:
                if response.status == 200:
                    return True
                body = response.read().decode("utf-8", errors="replace").lower()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace").lower()
            return exc.code == 200 and "loading model" not in body
        except Exception:
            return False
        return "loading model" not in body

    def _build_command(
        self,
        backend: InferenceBackend,
        runtime: Path | LlamaCppRuntime,
        model_id: str,
        entry_path: Path,
        port: int,
        mmproj_path: Path | None = None,
    ) -> list[str]:
        if backend in {"llama_cpp", "llama_cpp_cuda", "llama_cpp_cpu"}:
            if not isinstance(runtime, LlamaCppRuntime):
                runtime = LlamaCppRuntime(runtime, "auto")
            return self._llama_cpp.build_command(runtime, entry_path, port, mmproj_path)

        return [
            str(runtime),
            "serve",
            model_id,
            "--verbose",
            "--config",
            str(entry_path),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ]

    def _normalize_runtime(self, runtime: str) -> ModelRuntime:
        if runtime in {"llama_cpp", "llama.cpp"}:
            return "llama_cpp"
        if runtime == "mobiinfer":
            return "mobiinfer"
        if runtime == "mnn":
            return "mnn"
        return "mobiinfer"

    def _find_backend_runtime(self, backend: InferenceBackend) -> Path | LlamaCppRuntime | None:
        if backend == "llama_cpp":
            return self._llama_cpp.find_runtime()
        if backend == "llama_cpp_cuda":
            return self._llama_cpp.find_runtime("cuda")
        if backend == "llama_cpp_cpu":
            return self._llama_cpp.find_runtime("cpu")
        if backend == "mobiinfer":
            return self._find_mobiinfer()
        return None

    def _find_mobiinfer(self) -> Path | None:
        env_path = os.environ.get("MOBIINFER_BIN")
        if env_path:
            path = Path(env_path).expanduser().resolve()
            if path.exists():
                return path

        candidates = [
            RESOURCES_DIR / "mobiinfer/mnncli",
            RESOURCES_DIR / "mobiinfer/mnncli.exe",
            RESOURCES_DIR / "mnn/mobiinfer-mnncli",
            RESOURCES_DIR / "mnn/mobiinfer-mnncli.exe",
            REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli",
            REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build_mnncli/mnncli.exe",
            REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build/mnncli",
            REPO_ROOT / "3rdparty/mobiinfer/apps/mnncli/build/mnncli.exe",
            REPO_ROOT / "3rdparty/mobiinfer/build/apps/mnncli/mnncli",
            REPO_ROOT / "3rdparty/mobiinfer/build/apps/mnncli/mnncli.exe",
            REPO_ROOT / "desktop/resources-linux/mobiinfer/mnncli",
            REPO_ROOT / "desktop/resources-win/mobiinfer/mnncli.exe",
            REPO_ROOT / "desktop/resources-mac-arm64/mobiinfer/mnncli",
            REPO_ROOT / "desktop/resources-mac-x64/mobiinfer/mnncli",
        ]
        for path in candidates:
            if path.exists():
                return path
        return None

    def _missing_binary_message(self, backend: InferenceBackend) -> str:
        if backend in {"llama_cpp", "llama_cpp_cuda", "llama_cpp_cpu"}:
            return self._llama_cpp.missing_binary_message()
        if backend == "mobiinfer":
            return (
                "MobiInfer binary was not found. Set MOBIINFER_BIN or build "
                "3rdparty/mobiinfer/apps/mnncli."
            )
        return "Unsupported runtime backend."
