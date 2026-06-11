import base64
import json
import mimetypes
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.paths import REPO_ROOT
from app.services.runtime_state import runtime_service


router = APIRouter()
LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
EXAMPLE_IMAGE_DIR = (REPO_ROOT / "test/data/example/pics").resolve()
SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _example_image_path(image_id: str) -> Path:
    path = (EXAMPLE_IMAGE_DIR / image_id).resolve()
    if (
        EXAMPLE_IMAGE_DIR not in path.parents
        or path.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES
        or not path.is_file()
    ):
        raise HTTPException(status_code=404, detail="Example image not found.")
    return path


def _example_image_summary(path: Path) -> dict[str, Any]:
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return {
        "id": path.name,
        "name": path.name,
        "path": str(path),
        "mime_type": mime_type,
        "size_bytes": path.stat().st_size,
    }


@router.get("/example-images")
def example_images() -> list[dict[str, Any]]:
    if not EXAMPLE_IMAGE_DIR.is_dir():
        return []
    return [
        _example_image_summary(path)
        for path in sorted(EXAMPLE_IMAGE_DIR.iterdir())
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
    ]


@router.get("/example-images/{image_id}")
def example_image(image_id: str) -> dict[str, Any]:
    path = _example_image_path(image_id)
    summary = _example_image_summary(path)
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    summary["data_uri"] = f"data:{summary['mime_type']};base64,{encoded}"
    return summary


@router.post("/chat/completions")
def chat_completions(payload: dict[str, Any]) -> dict[str, Any]:
    status = runtime_service.status()
    if status.state != "running" or not status.port:
        raise HTTPException(status_code=409, detail="Inference server is not running.")

    upstream_payload = dict(payload)
    upstream_payload["stream"] = False
    data = json.dumps(upstream_payload).encode("utf-8")
    request = urllib.request.Request(
        f"http://127.0.0.1:{status.port}/v1/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with LOCAL_OPENER.open(request, timeout=120) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Inference server request failed: {exc}") from exc

    try:
        return json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Inference server returned invalid JSON.") from exc
