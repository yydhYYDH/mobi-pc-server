#!/usr/bin/env python3
import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BACKEND_URL = "http://127.0.0.1:8000"
DEFAULT_MODEL = "qwen3.5-0.8b-q4-k-m-gguf"
DEFAULT_PROMPT = "请用一句话描述这张图片。"
LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start/load llama.cpp through the local backend and send an OpenAI image_url prompt."
    )
    parser.add_argument("image", help="Path to the image file sent to llama.cpp.")
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--max-tokens", type=int, default=128)
    parser.add_argument("--temperature", type=float, default=0.2)
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument("--skip-load", action="store_true", help="Do not call /api/llama-cpp/load-model first.")
    parser.add_argument("--direct-url", help="Send directly to an already-running /v1/chat/completions endpoint.")
    parser.add_argument(
        "--allow-no-mmproj",
        action="store_true",
        help="Do not fail early when LLAMA_CPP_MMPROJ is unset. Useful with --skip-load against an already multimodal server.",
    )
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


def image_data_uri(path: Path) -> str:
    path = path.expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Image not found: {path}")
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    if not mime.startswith("image/"):
        raise ValueError(f"File does not look like an image: {path}")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def main() -> int:
    args = parse_args()
    if not args.skip_load and not args.direct_url and not os.environ.get("LLAMA_CPP_MMPROJ") and not args.allow_no_mmproj:
        print(
            "LLAMA_CPP_MMPROJ is not set. The backend can start llama.cpp, but image input "
            "requires a vision-capable GGUF plus its mmproj. Set LLAMA_CPP_MMPROJ=/path/to/mmproj.gguf "
            "or pass --skip-load/--direct-url for an already-running multimodal server.",
            file=sys.stderr,
        )
        return 2

    backend_url = args.backend_url.rstrip("/")
    chat_url = args.direct_url or f"{backend_url}/api/runtime/chat/completions"

    if not args.skip_load and not args.direct_url:
        status = post_json(
            f"{backend_url}/api/llama-cpp/load-model",
            {"model_id": args.model, "backend": "llama_cpp"},
            args.timeout,
        )
        print(json.dumps({"load_model": status}, ensure_ascii=False, indent=2))
        if status.get("state") != "running":
            print("llama.cpp backend did not reach running state.", file=sys.stderr)
            return 1

    data_uri = image_data_uri(Path(args.image))
    payload = {
        "model": args.model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": args.prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ],
        "max_tokens": args.max_tokens,
        "temperature": args.temperature,
        "stream": False,
    }
    example_payload = json.loads(json.dumps(payload, ensure_ascii=False))
    example_payload["messages"][0]["content"][1]["image_url"]["url"] = "data:image/...;base64,<base64>"

    print("Request command equivalent:")
    print(
        "curl -sS "
        f"{json.dumps(chat_url)} "
        "-H 'Content-Type: application/json' "
        f"-d {json.dumps(json.dumps(example_payload, ensure_ascii=False), ensure_ascii=False)}"
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
