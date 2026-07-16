#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
TARGET_PLATFORM="${PC_SERVER_DESKTOP_TARGET_PLATFORM:-$(uname -s)}"
TARGET_ARCH="${PC_SERVER_DESKTOP_TARGET_ARCH:-$(uname -m)}"

source "$ROOT_DIR/scripts/backend-python.sh"

case "$TARGET_ARCH" in
  x86_64)
    TARGET_ARCH="x64"
    ;;
  arm64|aarch64)
    TARGET_ARCH="arm64"
    ;;
esac

case "$TARGET_PLATFORM" in
  Darwin|darwin|mac|macos)
    DESKTOP_BACKEND_DIR="$ROOT_DIR/desktop/resources-mac-$TARGET_ARCH/backend"
    ;;
  Linux|linux)
    DESKTOP_BACKEND_DIR="$ROOT_DIR/desktop/resources-linux-$TARGET_ARCH/backend"
    ;;
  *)
    DESKTOP_BACKEND_DIR="$ROOT_DIR/desktop/resources-linux-$TARGET_ARCH/backend"
    ;;
esac

PYTHON_BIN="$(pc_server_ensure_backend_python "$BACKEND_DIR")"

cd "$BACKEND_DIR"
"$PYTHON_BIN" -m pip install --upgrade "pip>=24.0" "setuptools>=68" wheel
"$PYTHON_BIN" -m pip install -e .
"$PYTHON_BIN" -m pip install pyinstaller

PYINSTALLER_ARGS=(
  --name pc-server-backend
  --onefile
  --clean
  --noconfirm
  --hidden-import app.legacy.hdc_server
  --hidden-import harmony_agent
  --hidden-import wechat_collect
  --hidden-import wechat_collect.service
  --hidden-import wechat_collect.collector
  --hidden-import wechat_collect.config
  --hidden-import wechat_collect.device
  --hidden-import wechat_collect.parser
  --hidden-import wechat_collect.render
  --add-data "app/legacy/harmony_agent.py:app/legacy"
  --add-data "app/legacy/serve_model.py:app/legacy"
  --add-data "app/legacy/prompts:app/legacy/prompts"
  --add-data "app/legacy/wechat_collect:app/legacy/wechat_collect"
)


"$PYTHON_BIN" -m PyInstaller "${PYINSTALLER_ARGS[@]}" app/main.py

mkdir -p "$DESKTOP_BACKEND_DIR"
cp "$BACKEND_DIR/dist/pc-server-backend" "$DESKTOP_BACKEND_DIR/pc-server-backend"

echo "Backend executable copied to $DESKTOP_BACKEND_DIR/pc-server-backend"
