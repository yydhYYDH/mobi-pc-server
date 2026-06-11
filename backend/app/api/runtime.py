import json
import urllib.error
import urllib.request
from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.runtime_state import runtime_service


router = APIRouter()


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
        with urllib.request.urlopen(request, timeout=120) as response:
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
