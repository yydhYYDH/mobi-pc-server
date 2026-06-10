#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
DESKTOP_BACKEND_DIR="$ROOT_DIR/desktop/resources/backend"
PYTHON_BIN="${PC_SERVER_PYTHON:-$BACKEND_DIR/.venv/bin/python}"

if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="$(command -v python3)"
fi

cd "$BACKEND_DIR"
"$PYTHON_BIN" -m pip install -e .
"$PYTHON_BIN" -m pip install pyinstaller
"$PYTHON_BIN" -m PyInstaller \
  --name pc-server-backend \
  --onefile \
  --clean \
  --noconfirm \
  app/main.py

mkdir -p "$DESKTOP_BACKEND_DIR"
cp "$BACKEND_DIR/dist/pc-server-backend" "$DESKTOP_BACKEND_DIR/pc-server-backend"

echo "Backend executable copied to $DESKTOP_BACKEND_DIR/pc-server-backend"
