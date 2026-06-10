# ModelScope Integration

Model options are stored in `configs/models.json`.

Downloaded files must be placed under `models/<model-id>/` and ignored by Git.

The backend service in `backend/app/services/modelscope.py` uses ModelScope's Python SDK:

```python
from modelscope import snapshot_download
```

Each catalog entry's `entry_file` should point to the MNN runtime config expected by `mnncli serve`, usually `config.json`.
