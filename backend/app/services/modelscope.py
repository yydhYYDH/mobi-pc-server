import json
import shutil
import threading
from pathlib import Path

from app.core.paths import MODEL_CATALOG_PATH, MODELS_DIR, REPO_ROOT
from app.schemas.models import LocalModel, ModelCatalogItem, ModelDownloadStatus


class ModelScopeService:
    def __init__(self) -> None:
        self._download_status: dict[str, ModelDownloadStatus] = {}
        self._lock = threading.Lock()

    def read_catalog(self) -> list[ModelCatalogItem]:
        if not MODEL_CATALOG_PATH.exists():
            return []

        with MODEL_CATALOG_PATH.open("r", encoding="utf-8") as file:
            raw_items = json.load(file)

        return [ModelCatalogItem.model_validate(item) for item in raw_items]

    def list_local_models(self) -> list[LocalModel]:
        local_models: list[LocalModel] = []
        for item in self.read_catalog():
            model_dir = self._safe_model_dir(item)
            entry_path = model_dir / item.entry_file
            local_models.append(
                LocalModel(
                    id=item.id,
                    name=item.name,
                    path=str(model_dir.relative_to(REPO_ROOT)),
                    entry_file=item.entry_file,
                    downloaded=entry_path.exists(),
                )
            )
        return local_models

    def download_model(self, model_id: str) -> dict[str, str]:
        item = self._find_model(model_id)
        existing = self.download_status(model_id)
        if existing.state in {"queued", "downloading", "verifying"}:
            return {"status": existing.state, "message": existing.message or "Download already running."}

        self._set_status(model_id, "queued", 0, "Queued for download.")
        thread = threading.Thread(target=self._download_worker, args=(item,), daemon=True)
        thread.start()
        return {"status": "queued", "message": f"Started download for {item.modelscope_id}."}

    def download_statuses(self) -> list[ModelDownloadStatus]:
        catalog_ids = {item.id for item in self.read_catalog()}
        with self._lock:
            statuses = list(self._download_status.values())

        known = {status.model_id for status in statuses}
        for model_id in sorted(catalog_ids - known):
            statuses.append(self.download_status(model_id))
        return statuses

    def download_status(self, model_id: str) -> ModelDownloadStatus:
        self._find_model(model_id)
        with self._lock:
            existing = self._download_status.get(model_id)
            if existing:
                return existing

        item = self._find_model(model_id)
        entry_path = self._safe_model_dir(item) / item.entry_file
        if entry_path.exists():
            return ModelDownloadStatus(
                model_id=model_id,
                state="downloaded",
                progress=100,
                message="Local model is ready.",
            )
        return ModelDownloadStatus(model_id=model_id, state="idle", progress=0, message=None)

    def _download_worker(self, item: ModelCatalogItem) -> None:
        model_id = item.id
        model_dir = self._safe_model_dir(item)
        model_dir.mkdir(parents=True, exist_ok=True)

        try:
            from modelscope import snapshot_download
        except ImportError as exc:
            self._set_status(model_id, "failed", 0, f"Install backend dependencies first: {exc}")
            return

        try:
            self._set_status(model_id, "downloading", 8, f"Downloading {item.modelscope_id}.")
            snapshot_download(
                model_id=item.modelscope_id,
                revision=item.revision,
                local_dir=str(model_dir),
            )
            self._set_status(model_id, "verifying", 92, "Verifying downloaded files.")
        except Exception as exc:  # noqa: BLE001 - return SDK errors to the UI as task status.
            self._set_status(model_id, "failed", 0, str(exc))
            return

        entry_path = model_dir / item.entry_file
        if not entry_path.exists():
            self._set_status(
                model_id,
                "failed",
                0,
                f"Downloaded model but did not find {entry_path}.",
            )
            return

        self._set_status(model_id, "downloaded", 100, f"Downloaded {item.modelscope_id}.")

    def delete_model(self, model_id: str) -> dict[str, str]:
        item = self._find_model(model_id)
        status = self.download_status(model_id)
        if status.state in {"queued", "downloading", "verifying"}:
            return {"status": "busy", "message": f"Download is still {status.state}."}

        model_dir = self._safe_model_dir(item)
        if not model_dir.exists():
            self._set_status(model_id, "idle", 0, None)
            return {"status": "not_found", "message": f"No local copy for {model_id}."}

        shutil.rmtree(model_dir)
        self._set_status(model_id, "idle", 0, None)
        return {"status": "deleted", "message": f"Deleted local model {model_id}."}

    def entry_path(self, model_id: str) -> Path:
        item = self._find_model(model_id)
        model_dir = self._safe_model_dir(item)
        entry_path = model_dir / item.entry_file
        if not entry_path.exists():
            raise FileNotFoundError(f"Model entry file does not exist: {entry_path}")
        return entry_path

    def _find_model(self, model_id: str) -> ModelCatalogItem:
        for item in self.read_catalog():
            if item.id == model_id:
                return item
        raise KeyError(model_id)

    def _safe_model_dir(self, item: ModelCatalogItem) -> Path:
        model_dir = (REPO_ROOT / item.local_dir).resolve()
        allowed_root = MODELS_DIR.resolve()
        if model_dir != allowed_root and allowed_root not in model_dir.parents:
            raise ValueError(f"Model path escapes models directory: {item.local_dir}")
        return model_dir

    def _set_status(
        self,
        model_id: str,
        state: str,
        progress: int,
        message: str | None,
    ) -> None:
        progress = max(0, min(progress, 100))
        with self._lock:
            self._download_status[model_id] = ModelDownloadStatus(
                model_id=model_id,
                state=state,
                progress=progress,
                message=message,
            )
