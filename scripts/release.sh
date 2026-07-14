#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_PLATFORM="$(uname -s)"
HOST_ARCH="$(uname -m)"
TARGET_ARCH="${PC_SERVER_DESKTOP_TARGET_ARCH:-$HOST_ARCH}"
BUILD_CUDA=0
SKIP_BACKEND=0
SKIP_MOBIINFER=0
SKIP_LLAMA_CPP=0

usage() {
  cat <<'EOF'
Usage: ./scripts/release.sh [options]

Build a release for the current Linux or macOS host. Native runtimes must be
built on a compatible target architecture; cross-platform builds are not
supported by this script.

Options:
  --arch <x64|arm64>  Target architecture (defaults to the host architecture).
  --cuda              Also build and package the CUDA llama.cpp runtime (Linux only).
  --skip-backend      Reuse the staged backend executable.
  --skip-mobiinfer    Reuse the staged MobiInfer runtime.
  --skip-llama-cpp    Reuse staged llama.cpp runtimes.
  -h, --help          Show this help text.

Requirements:
  - Initialized mobiinfer and llama.cpp submodules.
  - Installed frontend and desktop dependencies.
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
    --cuda)
      BUILD_CUDA=1
      shift
      ;;
    --skip-backend)
      SKIP_BACKEND=1
      shift
      ;;
    --skip-mobiinfer)
      SKIP_MOBIINFER=1
      shift
      ;;
    --skip-llama-cpp)
      SKIP_LLAMA_CPP=1
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
    LLAMA_CPU_MODE="cpu"
    ;;
  Darwin)
    TARGET_PLATFORM="darwin"
    DESKTOP_BUILD_SCRIPT="build-mac-$([[ "$TARGET_ARCH" == "arm64" ]] && echo arm || echo x64)"
    HDC_ENV_NAME="HDC_BIN_DARWIN"
    LLAMA_CPU_MODE="metal"
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
if [[ "$BUILD_CUDA" -eq 1 && "$TARGET_PLATFORM" != "linux" ]]; then
  fail "--cuda is supported only for Linux releases; macOS uses Metal"
fi

require_file() {
  [[ -e "$1" ]] || fail "missing $2: $1"
}

run() {
  echo "+ $*"
  "$@"
}

require_file "$ROOT_DIR/3rdparty/mobiinfer/CMakeLists.txt" "MobiInfer source"
require_file "$ROOT_DIR/3rdparty/llama.cpp/CMakeLists.txt" "llama.cpp source"
require_file "$ROOT_DIR/frontend/package.json" "frontend package manifest"
require_file "$ROOT_DIR/frontend/package-lock.json" "frontend dependency lockfile"
require_file "$ROOT_DIR/desktop/package.json" "desktop package manifest"
require_file "$ROOT_DIR/desktop/package-lock.json" "desktop dependency lockfile"

run npm --prefix "$ROOT_DIR/frontend" ci
run npm --prefix "$ROOT_DIR/desktop" ci

HDC_BIN="${!HDC_ENV_NAME:-${HDC_BIN:-}}"
if [[ -z "$HDC_BIN" ]]; then
  HDC_BIN="$(command -v hdc || true)"
fi
[[ -n "$HDC_BIN" && -x "$HDC_BIN" ]] || fail "hdc was not found; set $HDC_ENV_NAME or add hdc to PATH"
export "$HDC_ENV_NAME=$HDC_BIN"

export PC_SERVER_DESKTOP_TARGET_PLATFORM="$TARGET_PLATFORM"
export PC_SERVER_DESKTOP_TARGET_ARCH="$TARGET_ARCH"

if [[ "$SKIP_BACKEND" -eq 0 ]]; then
  run "$ROOT_DIR/scripts/build-backend.sh"
fi
if [[ "$SKIP_MOBIINFER" -eq 0 ]]; then
  run "$ROOT_DIR/scripts/build-mobiinfer.sh"
fi
if [[ "$SKIP_LLAMA_CPP" -eq 0 ]]; then
  CPU_INSTALL_DIR="$ROOT_DIR/desktop/resources-$TARGET_PLATFORM-$TARGET_ARCH/llama-cpp/cpu"
  run env LLAMA_CPP_BUILD_MODE="$LLAMA_CPU_MODE" LLAMA_CPP_INSTALL_DIR="$CPU_INSTALL_DIR" \
    "$ROOT_DIR/scripts/build-llama-cpp.sh"

  if [[ "$BUILD_CUDA" -eq 1 ]]; then
    CUDA_INSTALL_DIR="$ROOT_DIR/desktop/resources-linux-$TARGET_ARCH/llama-cpp/cuda"
    run env LLAMA_CPP_BUILD_MODE=cuda LLAMA_CPP_INSTALL_DIR="$CUDA_INSTALL_DIR" \
      "$ROOT_DIR/scripts/build-llama-cpp.sh"
  fi
fi

run npm --prefix "$ROOT_DIR/frontend" run build
run npm --prefix "$ROOT_DIR/desktop" run "$DESKTOP_BUILD_SCRIPT"

echo "Release artifacts are available under $ROOT_DIR/desktop/release"
