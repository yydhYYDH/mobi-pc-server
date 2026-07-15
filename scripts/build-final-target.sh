#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_PLATFORM="$(uname -s)"
HOST_ARCH="$(uname -m)"
TARGET_ARCH="${PC_SERVER_DESKTOP_TARGET_ARCH:-$HOST_ARCH}"

usage() {
  cat <<'EOF'
Usage: ./scripts/build-final-target.sh [options]

Run only the final desktop npm packaging target for the current Linux or macOS
host. This script assumes native runtime files, backend executable, frontend
assets, and npm dependencies have already been prepared.

Options:
  --arch <x64|arm64>  Target architecture (defaults to the host architecture).
  -h, --help          Show this help text.

Examples:
  ./scripts/build-final-target.sh --arch x64
  ./scripts/build-final-target.sh --arch arm64
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
    ;;
  Darwin)
    TARGET_PLATFORM="darwin"
    DESKTOP_BUILD_SCRIPT="build-mac-$([[ "$TARGET_ARCH" == "arm64" ]] && echo arm || echo x64)"
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

[[ -f "$ROOT_DIR/desktop/package.json" ]] || fail "missing desktop package manifest: $ROOT_DIR/desktop/package.json"

export PC_SERVER_DESKTOP_TARGET_PLATFORM="$TARGET_PLATFORM"
export PC_SERVER_DESKTOP_TARGET_ARCH="$TARGET_ARCH"

echo "+ npm --prefix \"$ROOT_DIR/desktop\" run \"$DESKTOP_BUILD_SCRIPT\""
npm --prefix "$ROOT_DIR/desktop" run "$DESKTOP_BUILD_SCRIPT"

echo "Release artifacts are available under $ROOT_DIR/desktop/release"
