# HarmonyOS hdc Integration

The backend owns all `hdc` interactions.

Expected first capabilities:

- Detect bundled `hdc` from `HDC_BIN`, then fall back to `hdc` on `PATH`.
- Run `hdc list targets`.
- Parse connected devices into structured API responses.
- Add explicit connect and disconnect endpoints.
- Add a controlled auto-connect endpoint that searches known wireless targets before doing a bounded LAN scan.

Do not expose a generic arbitrary-command endpoint to the frontend.

## HDC Discovery

The Electron shell sets `HDC_BIN` to the packaged `resources/hdc/hdc` path and prepends
that directory to `PATH`. The backend still treats the packaged tool as optional:

- Missing packaged `hdc` is skipped.
- Non-executable packaged `hdc` is skipped.
- Wrong-platform binaries are skipped by native format checks:
  Linux uses ELF, macOS uses Mach-O, and Windows uses PE.
- Packaged `hdc` that starts with loader errors, for example missing shared libraries,
  is skipped.
- After skipping an unusable packaged binary, the backend scans `PATH` and uses the
  first usable system `hdc`.

This behavior is the same on Linux, macOS, and Windows. If neither bundled nor system
`hdc` is usable, `/api/devices/hdc` reports unavailable and the UI shows `HDC 未找到`.

## Auto Connect

`POST /api/devices/hdc/auto-connect` is backed by `backend/app/services/hdc.py`.

The auto-connect flow tries, in order:

- Existing `hdc list targets` results.
- `HDC_TARGET`.
- `HDC_AUTO_TARGETS`, as a comma-separated list of `host:port` values.
- Previously successful wireless targets from `.hdc-auto-cache/targets.json`.
- `hdc discover` output.
- A bounded LAN scan on local private IPv4 prefixes.

Default scanned ports are `8710`, `10178`, and `5555`. Extra ports can be added with `HDC_AUTO_PORTS`.

After a device connects, the backend also prepares an LLM reverse port:

```text
phone http://127.0.0.1:15000 -> PC http://127.0.0.1:<LLM server port>
```

The backend also exposes the PC server control channel to the phone:

```text
phone http://127.0.0.1:15001 -> PC http://127.0.0.1:<PC_SERVER_BACKEND_PORT>
```

The default PC server backend port is `18188`. The phone app should use:

```text
GET http://127.0.0.1:15001/status
WS  ws://127.0.0.1:15001/events
```

The default LLM server port is `8088`. The frontend settings page and device page can override it before connecting. The phone should use `http://127.0.0.1:15000` as the LLM server base URL.

Useful tuning variables:

```text
HDC_AUTO_CACHE=.hdc-auto-cache/targets.json
HDC_AUTO_TARGETS=192.168.1.20:8710,192.168.1.21:10178
HDC_AUTO_PORTS=8710,10178,5555
HDC_AUTO_CONNECT_TIMEOUT=0.25
HDC_AUTO_TCONN_TIMEOUT=6
HDC_AUTO_DISCOVER_TIMEOUT=5
HDC_AUTO_SCAN_BUDGET=12
HDC_AUTO_MAX_WORKERS=128
HDC_AUTO_MAX_SUBNETS=8
```
