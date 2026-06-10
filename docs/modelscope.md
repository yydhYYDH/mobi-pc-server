# ModelScope Integration

Model options are stored in `configs/models.json`.

Downloaded files must be placed under `models/<model-id>/` and ignored by Git.

The backend service in `backend/app/services/modelscope.py` should later call ModelScope's Python SDK, likely `snapshot_download`, after the dependency is added to `backend/pyproject.toml`.

