# HarmonyOS hdc Integration

The backend owns all `hdc` interactions.

Expected first capabilities:

- Detect `hdc` on `PATH`.
- Run `hdc list targets`.
- Parse connected devices into structured API responses.
- Add explicit connect and disconnect endpoints.
- Add a controlled auto-connect endpoint that searches known wireless targets before doing a bounded LAN scan.

Do not expose a generic arbitrary-command endpoint to the frontend.

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
phone http://127.0.0.1:19000 -> PC http://127.0.0.1:<LLM server port>
```

The default LLM server port is `8088`. The frontend settings page and device page can override it before connecting. The phone should use `http://127.0.0.1:19000` as the LLM server base URL.

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
