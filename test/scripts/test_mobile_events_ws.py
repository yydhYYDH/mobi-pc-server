#!/usr/bin/env python3
import argparse
import asyncio
import json
import time
import urllib.request


def http_status_url(ws_url: str) -> str:
    if ws_url.startswith("ws://"):
        return "http://" + ws_url[len("ws://") :].rsplit("/", 1)[0] + "/status"
    if ws_url.startswith("wss://"):
        return "https://" + ws_url[len("wss://") :].rsplit("/", 1)[0] + "/status"
    raise ValueError("URL must start with ws:// or wss://")


def check_status(url: str) -> None:
    with urllib.request.urlopen(url, timeout=3) as response:
        body = response.read().decode("utf-8", errors="replace")
    print(f"status_http={response.status} url={url}")
    try:
        payload = json.loads(body)
        print(f"status_payload ok={payload.get('ok')} status={payload.get('status')} message={payload.get('message')}")
    except json.JSONDecodeError:
        print(f"status_body={body[:200]}")


async def run_probe(url: str, duration: float, expect_interval: float) -> int:
    try:
        import websockets
    except ImportError:
        print("Missing dependency: pip install websockets")
        return 2

    started_at = time.monotonic()
    last_event_at = started_at
    counts: dict[str, int] = {}
    messages = 0

    try:
        async with websockets.connect(url, ping_interval=10, ping_timeout=10, close_timeout=2) as ws:
            print(f"websocket_connected url={url}")
            while time.monotonic() - started_at < duration:
                timeout = max(0.1, min(expect_interval, duration - (time.monotonic() - started_at)))
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                except asyncio.TimeoutError:
                    idle_for = time.monotonic() - last_event_at
                    print(f"timeout_waiting_for_event idle_for={idle_for:.1f}s")
                    return 1
                messages += 1
                last_event_at = time.monotonic()
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    print(f"event_invalid_json raw={raw[:200]!r}")
                    return 1
                event_type = str(event.get("type", ""))
                counts[event_type] = counts.get(event_type, 0) + 1
                print(f"event #{messages} type={event_type}")
    except Exception as exc:
        print(f"websocket_failed {type(exc).__name__}: {exc}")
        return 1

    elapsed = time.monotonic() - started_at
    print(f"websocket_stable duration={elapsed:.1f}s messages={messages} counts={counts}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe PC Server mobile /events WebSocket stability.")
    parser.add_argument("--url", default="ws://127.0.0.1:18188/events")
    parser.add_argument("--duration", type=float, default=30.0)
    parser.add_argument("--expect-interval", type=float, default=5.0)
    parser.add_argument("--skip-status", action="store_true")
    args = parser.parse_args()

    if not args.skip_status:
        check_status(http_status_url(args.url))
    return asyncio.run(run_probe(args.url, args.duration, args.expect_interval))


if __name__ == "__main__":
    raise SystemExit(main())
