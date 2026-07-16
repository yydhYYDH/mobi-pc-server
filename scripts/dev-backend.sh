#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PYTHON_BIN="${PC_SERVER_PYTHON:-}"
HOST="${PC_SERVER_BACKEND_HOST:-127.0.0.1}"
PORT="${PC_SERVER_BACKEND_PORT:-}"

source "$ROOT_DIR/scripts/backend-python.sh"

PYTHON_BIN="$(pc_server_ensure_backend_python "$BACKEND_DIR")"

if ! "$PYTHON_BIN" -c "import uvicorn" >/dev/null 2>&1; then
  "$PYTHON_BIN" -m pip install --upgrade "pip>=24.0" "setuptools>=68" wheel
  "$PYTHON_BIN" -m pip install -e "$BACKEND_DIR"
fi

if [[ -z "$PORT" ]]; then
  PORT="$(
    "$PYTHON_BIN" - <<'PY'
import socket

host = "127.0.0.1"
start = 18188
for port in range(start, start + 20):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        if sock.connect_ex((host, port)) != 0:
            print(port)
            break
else:
    raise SystemExit(f"No available backend port found from {start} to {start + 19}")
PY
  )"
fi

echo "Starting backend on http://$HOST:$PORT"

cd "$BACKEND_DIR"
exec "$PYTHON_BIN" -m uvicorn app.main:app --reload --host "$HOST" --port "$PORT"
