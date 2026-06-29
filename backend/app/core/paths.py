import os
from pathlib import Path


def _path_from_env(name: str) -> Path | None:
    value = os.getenv(name)
    if not value:
        return None
    return Path(value).expanduser().resolve()


REPO_ROOT = _path_from_env("PC_SERVER_ROOT") or Path(__file__).resolve().parents[3]
RESOURCES_DIR = _path_from_env("PC_SERVER_RESOURCES") or REPO_ROOT
CONFIGS_DIR = _path_from_env("PC_SERVER_CONFIGS_DIR") or REPO_ROOT / "configs"
MODELS_DIR = _path_from_env("PC_SERVER_MODELS_DIR") or REPO_ROOT / "models"
LOGS_DIR = _path_from_env("PC_SERVER_LOGS_DIR") or REPO_ROOT / "logs"
MODEL_CATALOG_PATH = CONFIGS_DIR / "models.json"
