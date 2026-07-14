#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_PLATFORM="$(uname -s)"
HOST_ARCH="$(uname -m)"
TARGET_ARCH="${PC_SERVER_DESKTOP_TARGET_ARCH:-$HOST_ARCH}"
SKIP_BACKEND=0

usage() {
  cat <<'EOF'
Usage: ./scripts/release.sh [options]

Build a release for the current Linux or macOS host. Native runtimes must be
built on a compatible target architecture; cross-platform builds are not
supported by this script.

Options:
  --arch <x64|arm64>  Target architecture (defaults to the host architecture).
  --skip-backend      Reuse the staged backend executable.
  -h, --help          Show this help text.

Requirements:
  - hdc on PATH, or HDC_BIN_LINUX/HDC_BIN_DARWIN set to its executable path.

Windows releases must be built with the PowerShell scripts under scripts/windows.
EOF
}

fail() {
  echo "error: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      [[ $# -ge 2 ]] || fail "--arch requires x64 or arm64"
      TARGET_ARCH="$2"
      shift 2
      ;;
    --skip-backend)
      SKIP_BACKEND=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

case "$TARGET_ARCH" in
  x64|x86_64|amd64)
    TARGET_ARCH="x64"
    ;;
  arm64|aarch64)
    TARGET_ARCH="arm64"
    ;;
  *)
    fail "unsupported architecture '$TARGET_ARCH'; use x64 or arm64"
    ;;
esac

case "$HOST_PLATFORM" in
  Linux)
    TARGET_PLATFORM="linux"
    DESKTOP_BUILD_SCRIPT="build-linux-$([[ "$TARGET_ARCH" == "arm64" ]] && echo arm || echo x64)"
    HDC_ENV_NAME="HDC_BIN_LINUX"
    ;;
  Darwin)
    TARGET_PLATFORM="darwin"
    DESKTOP_BUILD_SCRIPT="build-mac-$([[ "$TARGET_ARCH" == "arm64" ]] && echo arm || echo x64)"
    HDC_ENV_NAME="HDC_BIN_DARWIN"
    ;;
  *)
    fail "unsupported host '$HOST_PLATFORM'; use scripts/windows on Windows"
    ;;
esac

HOST_ARCH_NORMALIZED="$HOST_ARCH"
case "$HOST_ARCH_NORMALIZED" in
  x86_64|amd64) HOST_ARCH_NORMALIZED="x64" ;;
  aarch64) HOST_ARCH_NORMALIZED="arm64" ;;
esac
if [[ "$TARGET_ARCH" != "$HOST_ARCH_NORMALIZED" ]]; then
  fail "target architecture $TARGET_ARCH differs from host $HOST_ARCH_NORMALIZED; use a compatible native toolchain"
fi
require_file() {
  [[ -e "$1" ]] || fail "missing $2: $1"
}

require_file "$ROOT_DIR/frontend/package.json" "frontend package manifest"
require_file "$ROOT_DIR/desktop/package.json" "desktop package manifest"

HDC_BIN="${!HDC_ENV_NAME:-${HDC_BIN:-}}"
if [[ -z "$HDC_BIN" ]]; then
  HDC_BIN="$(command -v hdc || true)"
fi
[[ -n "$HDC_BIN" && -x "$HDC_BIN" ]] || fail "hdc was not found; set $HDC_ENV_NAME or add hdc to PATH"
export "$HDC_ENV_NAME=$HDC_BIN"

export PC_SERVER_DESKTOP_TARGET_PLATFORM="$TARGET_PLATFORM"
export PC_SERVER_DESKTOP_TARGET_ARCH="$TARGET_ARCH"

run() {
  echo "+ $*"
  "$@"
}

if [[ "$SKIP_BACKEND" -eq 0 ]]; then
  run "$ROOT_DIR/scripts/build-backend.sh"
fi
run npm --prefix "$ROOT_DIR/frontend" ci
run npm --prefix "$ROOT_DIR/desktop" ci
run npm --prefix "$ROOT_DIR/frontend" run build
run npm --prefix "$ROOT_DIR/desktop" run "$DESKTOP_BUILD_SCRIPT"

echo "Release artifacts are available under $ROOT_DIR/desktop/release"
