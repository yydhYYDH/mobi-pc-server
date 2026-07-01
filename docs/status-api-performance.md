# Status API Performance Notes

Measured on 2026-07-01 against the local backend at `127.0.0.1:18188` after a backend restart.

## Summary

| Area | Endpoint | Median | Max | Notes |
| --- | --- | ---: | ---: | --- |
| Health | `GET /api/health` | 6.7 ms | 23.0 ms | Fast. Suitable for short health probes. |
| Model catalog | `GET /api/models/catalog` | 29.2 ms | 35.8 ms | Fast enough for page load. |
| Local model status | `GET /api/models/local` | 181.7 ms | 264.1 ms | Acceptable, but avoid very high-frequency polling. |
| Model download status | `GET /api/models/downloads` | 1287.2 ms | 1526.3 ms | Slow. Should be event-driven or cached. |
| MobiInfer runtime status | `GET /api/mobiinfer/status` | 11.3 ms | 54.8 ms | Fast. Suitable for UI refresh. |
| MNN runtime status | `GET /api/mnn/status` | 9.2 ms | 13.3 ms | Fast. |
| llama.cpp runtime status | `GET /api/llama-cpp/status` | 7.6 ms | 33.3 ms | Fast. |
| HDC device status | `GET /api/devices/hdc` | 1382.2 ms | 1825.1 ms | Old behavior. Before caching, each request called `hdc list targets`. |
| Mobile status | `GET /status` | 15.0 ms | 23.1 ms | Fast path. Does not run slow HDC checks. |

## Interpretation

The measured slow paths were:

- `GET /api/devices/hdc`: previously depended on live HDC command execution, so each request took about 1.4 seconds.
- `GET /api/models/downloads`: currently takes about 0.7-1.5 seconds and should not be treated as a cheap status read.

The mobile-facing `GET /status` is intentionally fast and should stay decoupled from slow HDC checks. The phone should use `/status` and `/events`, while the desktop UI can use `/api/devices/hdc` at a lower frequency or consume cached state.

## HDC Status Cache

`GET /api/devices/hdc` now reads the latest cached HDC status. The backend HDC monitor refreshes that cache every 5 seconds with a live `hdc list targets` call.

This means:

- Desktop UI refreshes no longer spawn a new `hdc list targets` process.
- Device connection/disconnection can take up to 5 seconds to appear in the UI.
- Manual connect, auto-connect, and disconnect still use live HDC checks where an immediate result is needed.

## UI Guidance

- Keep runtime status polling at about 2 seconds if needed.
- `GET /api/devices/hdc` is now cheap enough for UI refresh because it reads cached state.
- Avoid using `GET /api/models/downloads` as a high-frequency heartbeat.
- Prefer backend-pushed events for HDC changes and model download progress.

## Reproduction

Run from the repository root while the backend is listening on `127.0.0.1:18188`:

```bash
backend/.venv/bin/python test/scripts/test_mobile_events_ws.py --duration 30
```

For detailed endpoint timings, use a short local script that repeatedly requests:

- `/api/health`
- `/api/models/catalog`
- `/api/models/local`
- `/api/models/downloads`
- `/api/mobiinfer/status`
- `/api/devices/hdc`
- `/status`
