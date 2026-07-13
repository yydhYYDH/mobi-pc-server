#!/usr/bin/env python3
import argparse
import json
import mimetypes
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BACKEND_URL = "http://127.0.0.1:8000"
DEFAULT_MODEL = "mnn-mobi-visual"
DEFAULT_PROMPT = "请用一句话描述这张图片。"
LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start/load MobiInfer through the local backend and send an image prompt."
    )
    parser.add_argument("image", help="Path to the image file sent to MobiInfer.")
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--max-tokens", type=int, default=128)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument("--skip-load", action="store_true", help="Do not call /api/mobiinfer/load-model first.")
    parser.add_argument("--direct-url", help="Send directly to an already-running /v1/chat/completions endpoint.")
    return parser.parse_args()


def post_json(url: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with LOCAL_OPENER.open(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        return json.loads(body) if body else {}


def ensure_image(path: Path) -> Path:
    path = path.expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Image not found: {path}")
    mime = mimetypes.guess_type(path.name)[0] or ""
    if not mime.startswith("image/"):
        raise ValueError(f"File does not look like an image: {path}")
    return path


def main() -> int:
    args = parse_args()
    image_path = ensure_image(Path(args.image))
    backend_url = args.backend_url.rstrip("/")
    chat_url = args.direct_url or f"{backend_url}/api/runtime/chat/completions"

    if not args.skip_load and not args.direct_url:
        status = post_json(
            f"{backend_url}/api/mobiinfer/load-model",
            {"model_id": args.model, "backend": "mobiinfer"},
            args.timeout,
        )
        print(json.dumps({"load_model": status}, ensure_ascii=False, indent=2))
        if status.get("state") != "running":
            print("MobiInfer backend did not reach running state.", file=sys.stderr)
            return 1

    content = f"<img>{image_path}</img>{args.prompt}"
    payload = {
        "model": args.model,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": args.max_tokens,
        "temperature": args.temperature,
        "stream": False,
    }

    print("Request command equivalent:")
    print(
        "curl -sS "
        f"{json.dumps(chat_url)} "
        "-H 'Content-Type: application/json' "
        f"-d {json.dumps(json.dumps(payload, ensure_ascii=False), ensure_ascii=False)}"
    )

    started = time.time()
    response = post_json(chat_url, payload, args.timeout)
    print(json.dumps(response, ensure_ascii=False, indent=2))
    print(f"Elapsed: {time.time() - started:.2f}s")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
