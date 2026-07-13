import base64
import json
import mimetypes
import re
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.core.paths import REPO_ROOT, RESOURCES_DIR
from app.services.modelscope import ModelScopeService
from app.services.runtime_state import runtime_service


router = APIRouter()
LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
model_service = ModelScopeService()


def _unique_paths(paths: list[Path]) -> list[Path]:
    unique: list[Path] = []
    seen: set[Path] = set()
    for path in paths:
        resolved = path.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(resolved)
    return unique


def _example_image_dirs() -> list[Path]:
    executable_dir = Path(sys.executable).resolve().parent
    return _unique_paths(
        [
            RESOURCES_DIR / "example-images",
            Path.cwd() / "example-images",
            executable_dir / "example-images",
            executable_dir.parent / "example-images",
            REPO_ROOT / "test/data/example/pics",
        ]
    )


EXAMPLE_IMAGE_DIRS = _example_image_dirs()
SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
UPLOAD_IMAGE_DIR = Path(tempfile.gettempdir()) / "pc_server_chat_images"
DATA_IMAGE_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$", re.DOTALL)
OPENAI_IMAGE_BLOCK_BACKENDS = {
    "llama_cpp",
    "llama_cpp_cuda",
    "llama_cpp_cpu",
    "llama.cpp",
    "llama.cpp cuda",
    "llama.cpp cpu",
}


def _example_image_path(image_id: str) -> Path:
    for image_dir in EXAMPLE_IMAGE_DIRS:
        path = (image_dir / image_id).resolve()
        if (
            image_dir in path.parents
            and path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
            and path.is_file()
        ):
            return path
    searched = ", ".join(str(path) for path in EXAMPLE_IMAGE_DIRS)
    raise HTTPException(status_code=404, detail=f"Example image not found. Searched: {searched}")


def _example_image_summary(path: Path) -> dict[str, Any]:
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return {
        "id": path.name,
        "name": path.name,
        "path": str(path),
        "mime_type": mime_type,
        "size_bytes": path.stat().st_size,
    }


def _safe_image_suffix(mime_type: str) -> str:
    suffix = mimetypes.guess_extension(mime_type) or ".jpg"
    if suffix == ".jpe":
        suffix = ".jpg"
    if suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES:
        return ".jpg"
    return suffix.lower()


def _save_data_uri_image(data_uri: str) -> str:
    match = DATA_IMAGE_RE.match(data_uri)
    if not match:
        raise HTTPException(status_code=400, detail="Only data:image/...;base64 image uploads are supported.")
    mime_type, encoded = match.groups()
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Uploaded image is not valid base64.") from exc
    UPLOAD_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = _safe_image_suffix(mime_type)
    handle = tempfile.NamedTemporaryFile(prefix="chat_", suffix=suffix, dir=UPLOAD_IMAGE_DIR, delete=False)
    with handle:
        handle.write(image_bytes)
    return handle.name


def _content_block_to_text(content: Any) -> Any:
    if not isinstance(content, list):
        return content

    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        if block_type == "text" and isinstance(block.get("text"), str):
            parts.append(block["text"])
        elif block_type == "image_url":
            image_url = block.get("image_url")
            url = image_url.get("url") if isinstance(image_url, dict) else None
            if isinstance(url, str):
                image_path = _save_data_uri_image(url)
                parts.append(f"<img>{image_path}</img>")
    return "\n".join(parts)


def _backend_accepts_openai_image_blocks(backend: str | None) -> bool:
    normalized = (backend or "").strip().lower().replace("-", "_")
    return (
        normalized in OPENAI_IMAGE_BLOCK_BACKENDS
        or normalized.startswith("llama_cpp")
        or ("llama" in normalized and "cpp" in normalized)
    )


def _payload_targets_llama_cpp_model(payload: dict[str, Any]) -> bool:
    model_id = payload.get("model")
    if not isinstance(model_id, str) or not model_id:
        return False
    try:
        return model_service.runtime(model_id).strip().lower().replace("-", "_") == "llama_cpp"
    except (KeyError, ValueError):
        return False


def _normalize_uploaded_images(payload: dict[str, Any], backend: str | None) -> dict[str, Any]:
    if _backend_accepts_openai_image_blocks(backend) or _payload_targets_llama_cpp_model(payload):
        return dict(payload)

    normalized = dict(payload)
    messages = normalized.get("messages")
    if not isinstance(messages, list):
        return normalized
    next_messages: list[Any] = []
    for message in messages:
        if not isinstance(message, dict):
            next_messages.append(message)
            continue
        next_message = dict(message)
        next_message["content"] = _content_block_to_text(next_message.get("content"))
        next_messages.append(next_message)
    normalized["messages"] = next_messages
    return normalized


@router.get("/example-images")
def example_images() -> list[dict[str, Any]]:
    images: dict[str, dict[str, Any]] = {}
    for image_dir in EXAMPLE_IMAGE_DIRS:
        if not image_dir.is_dir():
            continue
        for path in sorted(image_dir.iterdir()):
            if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES:
                images.setdefault(path.name, _example_image_summary(path))
    return list(images.values())


@router.get("/example-images/{image_id}")
def example_image(image_id: str) -> dict[str, Any]:
    path = _example_image_path(image_id)
    summary = _example_image_summary(path)
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    summary["data_uri"] = f"data:{summary['mime_type']};base64,{encoded}"
    return summary


@router.post("/chat/completions", response_model=None)
def chat_completions(payload: dict[str, Any]) -> Any:
    status = runtime_service.status()
    if status.state != "running" or not status.port:
        detail = status.message or "Inference server is not running."
        raise HTTPException(status_code=409, detail=detail)

    upstream_payload = _normalize_uploaded_images(payload, status.backend)
    stream = bool(upstream_payload.get("stream"))
    upstream_payload["stream"] = stream
    data = json.dumps(upstream_payload).encode("utf-8")
    request = urllib.request.Request(
        f"http://127.0.0.1:{status.port}/v1/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    if stream:
        def stream_upstream():
            try:
                with LOCAL_OPENER.open(request, timeout=120) as response:
                    while True:
                        line = response.readline()
                        if not line:
                            break
                        yield line
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                yield f"data: {json.dumps({'error': detail}, ensure_ascii=False)}\n\n".encode("utf-8")
            except urllib.error.URLError as exc:
                message = f"Inference server request failed: {exc}"
                yield f"data: {json.dumps({'error': message}, ensure_ascii=False)}\n\n".encode("utf-8")

        return StreamingResponse(
            stream_upstream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
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
