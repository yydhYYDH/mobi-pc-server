from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIGS_DIR = REPO_ROOT / "configs"
MODELS_DIR = REPO_ROOT / "models"
LOGS_DIR = REPO_ROOT / "logs"
MODEL_CATALOG_PATH = CONFIGS_DIR / "models.json"

