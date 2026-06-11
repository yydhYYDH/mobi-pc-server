import os
import socket
import subprocess
import time
from datetime import datetime
from pathlib import Path

from app.core.paths import LOGS_DIR, REPO_ROOT
from app.schemas.mnn import MnnStatus
from app.services.modelscope import ModelScopeService


DEFAULT_MNN_PORT = 8088
MNN_LOG_FILE = "mnncli.log"


class MnnServerService:
    def __init__(self) -> None:
        self._status = MnnStatus(state="stopped")
        self._process: subprocess.Popen[str] | None = None
        self._models = ModelScopeService()

    def status(self) -> MnnStatus:
        if self._process and self._process.poll() is not None:
            self._append_log(f"mnncli process exited with code {self._process.returncode}.")
            self._status = MnnStatus(
                state="error",
                active_model_id=self._status.active_model_id,
                port=self._status.port,
                message=f"mnncli exited with code {self._process.returncode}.",
            )
            self._process = None
        if self._process and self._process.poll() is None:
            self._status.managed_by_backend = True
            return self._status
        if self._is_port_open(self._status.port or DEFAULT_MNN_PORT):
            return MnnStatus(
                state="running",
                active_model_id=self._status.active_model_id,
                port=self._status.port or DEFAULT_MNN_PORT,
                message="Detected an existing MNN-compatible service on this port.",
                managed_by_backend=False,
            )
        return self._status

    def start(self) -> MnnStatus:
        if self._status.active_model_id:
            self._append_log(f"Restart requested for model {self._status.active_model_id}.")
            return self.load_model(self._status.active_model_id)

        self._append_log("Start requested without an active model.")
        self._status = MnnStatus(state="error", message="Load a model before starting MNN server.")
        return self._status

    def stop(self) -> MnnStatus:
        if self._process and self._process.poll() is None:
            self._append_log(f"Stopping managed mnncli process pid={self._process.pid}.")
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
                self._append_log(f"mnncli process stopped with code {self._process.returncode}.")
            except subprocess.TimeoutExpired:
                self._append_log("mnncli did not stop within 10s; killing process.")
                self._process.kill()
                self._process.wait(timeout=5)
                self._append_log(f"mnncli process killed with code {self._process.returncode}.")

        self._process = None
        if self._is_port_open(self._status.port or DEFAULT_MNN_PORT):
            self._append_log(
                f"Port {self._status.port or DEFAULT_MNN_PORT} is still open after stop; treating as external service."
            )
            self._status = MnnStatus(
                state="running",
                active_model_id=self._status.active_model_id,
                port=self._status.port or DEFAULT_MNN_PORT,
                message="MNN service is online, but it was not started by this backend.",
                managed_by_backend=False,
            )
            return self._status

        self._append_log("MNN service stopped.")
        self._status = MnnStatus(state="stopped")
        return self._status

    def load_model(self, model_id: str) -> MnnStatus:
        self._append_log(f"Load model requested: {model_id}.")
        entry_path = self._models.entry_path(model_id)
        mnncli_path = self._find_mnncli()
        if not mnncli_path:
            self._append_log("mnncli binary was not found.")
            self._status = MnnStatus(
                state="error",
                active_model_id=model_id,
                message=(
                    "mnncli binary was not found. Set MNNCLI_BIN or build "
                    "3rdparty/MNN/apps/mnncli."
                ),
            )
            return self._status

        self.stop()
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        log_file = (LOGS_DIR / MNN_LOG_FILE).open("a", encoding="utf-8")
        port = DEFAULT_MNN_PORT
        command = [
            str(mnncli_path),
            "serve",
            model_id,
            "--config",
            str(entry_path),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ]
        self._append_log(
            "Starting mnncli: "
            f"binary={mnncli_path} model={model_id} config={entry_path} host=127.0.0.1 port={port}"
        )
        self._append_log(f"Working directory: {REPO_ROOT}")
        self._process = subprocess.Popen(
            command,
            cwd=str(REPO_ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self._append_log(f"mnncli process created pid={self._process.pid}.")

        time.sleep(0.6)
        if self._process.poll() is not None:
            self._append_log(f"mnncli exited during startup with code {self._process.returncode}.")
            self._status = MnnStatus(
                state="error",
                active_model_id=model_id,
                port=port,
                message=f"mnncli exited during startup with code {self._process.returncode}. Check logs/mnncli.log.",
            )
            self._process = None
            return self._status

        self._append_log(f"mnncli startup check passed on port {port}.")
        self._status = MnnStatus(
            state="running",
            active_model_id=model_id,
            port=port,
            message=f"Started mnncli serve for {model_id}.",
            managed_by_backend=True,
        )
        return self._status

    def _append_log(self, message: str) -> None:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
        with (LOGS_DIR / MNN_LOG_FILE).open("a", encoding="utf-8") as file:
            file.write(f"[pc-server] {timestamp} {message}\n")

    def _is_port_open(self, port: int) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return True
        except OSError:
            return False

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
