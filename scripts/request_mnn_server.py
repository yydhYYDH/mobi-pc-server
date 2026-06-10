#!/usr/bin/env python3
import argparse
import json
import sys
import time
import urllib.error
import urllib.request


DEFAULT_MODEL = "mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-w8g128-mnn"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Request the local MNN OpenAI-compatible chat endpoint.")
    parser.add_argument("--url", default="http://127.0.0.1:8088/v1/chat/completions")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--prompt", default="你好，用五个字回复。")
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--no-stream", action="store_true", help="Send a non-streaming request.")
    return parser.parse_args()


def post_json(url: str, payload: dict, timeout: float):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return urllib.request.urlopen(request, timeout=timeout)


def print_stream(response) -> None:
    content_parts: list[str] = []
    for raw_line in response:
        line = raw_line.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        if not line.startswith("data:"):
            print(line)
            continue

        event = line.removeprefix("data:").strip()
        if event == "[DONE]":
            break

        try:
            chunk = json.loads(event)
        except json.JSONDecodeError:
            print(line)
            continue

        delta = chunk.get("choices", [{}])[0].get("delta", {})
        token = delta.get("content", "")
        if token:
            content_parts.append(token)
            print(token, end="", flush=True)

    print()
    if content_parts:
        print("\n--- full text ---")
        print("".join(content_parts))


def print_json_response(response) -> None:
    body = response.read().decode("utf-8", errors="replace")
    if not body:
        print("Empty response body.")
        return
    try:
        print(json.dumps(json.loads(body), ensure_ascii=False, indent=2))
    except json.JSONDecodeError:
        print(body)


def main() -> int:
    args = parse_args()
    payload = {
        "model": args.model,
        "messages": [{"role": "user", "content": args.prompt}],
        "stream": not args.no_stream,
    }

    started = time.time()
    try:
        with post_json(args.url, payload, args.timeout) as response:
            print(f"HTTP {response.status} {response.reason}")
            print(f"Model: {args.model}")
            print(f"Prompt: {args.prompt}")
            print("--- response ---")
            if args.no_stream:
                print_json_response(response)
            else:
                print_stream(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP error {exc.code}: {body}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1
    finally:
        print(f"Elapsed: {time.time() - started:.2f}s")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
