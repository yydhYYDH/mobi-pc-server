#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PYTHON_BIN="${PC_SERVER_PYTHON:-}"
HOST="${PC_SERVER_BACKEND_HOST:-127.0.0.1}"
PORT="${PC_SERVER_BACKEND_PORT:-}"

if [[ -z "$PYTHON_BIN" ]]; then
  for candidate in "$BACKEND_DIR/.venv/bin/python" "$BACKEND_DIR/.venv-linux/bin/python"; do
    if [[ -x "$candidate" ]]; then
      PYTHON_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
  if [[ ! -x "$PYTHON_BIN" ]]; then
    PYTHON_CREATE_BIN="$(command -v python3 || command -v python || true)"
    if [[ -z "$PYTHON_CREATE_BIN" ]]; then
      echo "python3 was not found on PATH. Install Python 3.10+ or set PC_SERVER_PYTHON." >&2
      exit 1
    fi
    "$PYTHON_CREATE_BIN" -m venv "$BACKEND_DIR/.venv"
  fi
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Python interpreter is not executable: $PYTHON_BIN" >&2
  exit 1
fi

if ! "$PYTHON_BIN" -c "import uvicorn" >/dev/null 2>&1; then
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
