import json
import shutil
from pathlib import Path

from app.core.paths import MODEL_CATALOG_PATH, MODELS_DIR, REPO_ROOT
from app.schemas.models import LocalModel, ModelCatalogItem


class ModelScopeService:
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
        model_dir = self._safe_model_dir(item)
        model_dir.mkdir(parents=True, exist_ok=True)

        try:
            from modelscope import snapshot_download
        except ImportError as exc:
            return {
                "status": "missing_dependency",
                "message": f"Install backend dependencies first: {exc}",
            }

        snapshot_download(
            model_id=item.modelscope_id,
            revision=item.revision,
            local_dir=str(model_dir),
        )

        entry_path = model_dir / item.entry_file
        if not entry_path.exists():
            return {
                "status": "downloaded_missing_entry",
                "message": f"Downloaded model but did not find {entry_path}.",
            }

        return {
            "status": "downloaded",
            "message": f"Downloaded {item.modelscope_id} to {model_dir}.",
        }

    def delete_model(self, model_id: str) -> dict[str, str]:
        item = self._find_model(model_id)
        model_dir = self._safe_model_dir(item)
        if not model_dir.exists():
            return {"status": "not_found", "message": f"No local copy for {model_id}."}

        shutil.rmtree(model_dir)
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
