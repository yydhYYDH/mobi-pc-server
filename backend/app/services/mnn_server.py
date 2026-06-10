import os
import subprocess
from pathlib import Path

from app.core.paths import LOGS_DIR, REPO_ROOT
from app.schemas.mnn import MnnStatus
from app.services.modelscope import ModelScopeService


class MnnServerService:
    def __init__(self) -> None:
        self._status = MnnStatus(state="stopped")
        self._process: subprocess.Popen[str] | None = None
        self._models = ModelScopeService()

    def status(self) -> MnnStatus:
        if self._process and self._process.poll() is not None:
            self._status = MnnStatus(
                state="error",
                active_model_id=self._status.active_model_id,
                port=self._status.port,
                message=f"mnncli exited with code {self._process.returncode}.",
            )
            self._process = None
        return self._status

    def start(self) -> MnnStatus:
        if self._status.active_model_id:
            return self.load_model(self._status.active_model_id)

        self._status = MnnStatus(state="error", message="Load a model before starting MNN server.")
        return self._status

    def stop(self) -> MnnStatus:
        if self._process and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=5)

        self._process = None
        self._status = MnnStatus(state="stopped")
        return self._status

    def load_model(self, model_id: str) -> MnnStatus:
        entry_path = self._models.entry_path(model_id)
        mnncli_path = self._find_mnncli()
        if not mnncli_path:
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
        log_file = (LOGS_DIR / "mnncli.log").open("a", encoding="utf-8")
        port = 8088
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
        self._process = subprocess.Popen(
            command,
            cwd=str(REPO_ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self._status = MnnStatus(
            state="running",
            active_model_id=model_id,
            port=port,
            message=f"Started mnncli serve for {model_id}.",
        )
        return self._status

    def _find_mnncli(self) -> Path | None:
        env_path = os.environ.get("MNNCLI_BIN")
        if env_path:
            path = Path(env_path).expanduser().resolve()
            return path if path.exists() else None

        candidates = [
            REPO_ROOT / "3rdparty/MNN/apps/mnncli/build/mnncli",
            REPO_ROOT / "3rdparty/MNN/apps/mnncli/build/mnncli.exe",
            REPO_ROOT / "3rdparty/MNN/build/apps/mnncli/mnncli",
            REPO_ROOT / "3rdparty/MNN/build/apps/mnncli/mnncli.exe",
        ]
        for path in candidates:
            if path.exists():
                return path
        return None
