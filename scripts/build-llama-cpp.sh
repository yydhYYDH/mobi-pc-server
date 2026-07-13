#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LLAMA_CPP_DIR="$ROOT_DIR/3rdparty/llama.cpp"
BUILD_TYPE="${LLAMA_CPP_BUILD_TYPE:-Release}"
BUILD_MODE="${LLAMA_CPP_BUILD_MODE:-}"
BUILD_JOBS="${LLAMA_CPP_BUILD_JOBS:-16}"
BUILD_DIR="${LLAMA_CPP_BUILD_DIR:-}"
CUDA_ARCH="${LLAMA_CPP_CUDA_ARCH:-89}"
TARGET="${LLAMA_CPP_TARGET:-llama-server}"
OSX_ARCHITECTURES="${LLAMA_CPP_OSX_ARCHITECTURES:-}"
TARGET_PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
TARGET_ARCH="${PC_SERVER_DESKTOP_TARGET_ARCH:-$(uname -m)}"

case "$TARGET_ARCH" in
  x64|x86_64|amd64)
    TARGET_ARCH="x64"
    ;;
  arm64|aarch64)
    TARGET_ARCH="arm64"
    ;;
esac

if [[ -z "$BUILD_MODE" ]]; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    BUILD_MODE="metal"
  else
    BUILD_MODE="cuda"
  fi
fi

if [[ -z "$OSX_ARCHITECTURES" && "$(uname -s)" == "Darwin" ]]; then
  case "$TARGET_ARCH" in
    x64|x86_64)
      OSX_ARCHITECTURES="x86_64"
      ;;
    arm64|aarch64)
      OSX_ARCHITECTURES="arm64"
      ;;
  esac
fi

if [[ ! -f "$LLAMA_CPP_DIR/CMakeLists.txt" ]]; then
  echo "Missing llama.cpp source at $LLAMA_CPP_DIR." >&2
  echo "Place the llama.cpp source tree in 3rdparty/llama.cpp, or provide a prebuilt llama-server binary in one of the documented paths." >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake was not found on PATH." >&2
  exit 1
fi

case "$BUILD_MODE" in
  cuda)
    BUILD_DIR="${BUILD_DIR:-$LLAMA_CPP_DIR/build-$TARGET_PLATFORM-$TARGET_ARCH-cuda}"
    CMAKE_FLAGS=(
      -DGGML_CUDA=ON
      -DGGML_NATIVE=ON
      -DCMAKE_CUDA_ARCHITECTURES="$CUDA_ARCH"
      -DLLAMA_BUILD_UI=OFF
      -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
    )
    ;;
  cpu)
    BUILD_DIR="${BUILD_DIR:-$LLAMA_CPP_DIR/build-$TARGET_PLATFORM-$TARGET_ARCH-cpu}"
    CMAKE_FLAGS=(
      -DGGML_NATIVE=ON
      -DLLAMA_BUILD_UI=OFF
      -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
    )
    ;;
  metal)
    BUILD_DIR="${BUILD_DIR:-$LLAMA_CPP_DIR/build-$TARGET_PLATFORM-$TARGET_ARCH-metal}"
    CMAKE_FLAGS=(
      -DGGML_METAL=ON
      -DGGML_NATIVE=OFF
      -DLLAMA_OPENSSL=OFF
      -DLLAMA_BUILD_UI=OFF
      -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
    )
    ;;
  *)
    echo "Unsupported LLAMA_CPP_BUILD_MODE=$BUILD_MODE. Use 'cuda', 'cpu', or 'metal'." >&2
    exit 1
    ;;
esac

if [[ "$(uname -s)" == "Darwin" ]]; then
  CMAKE_FLAGS+=(-DGGML_NATIVE=OFF)
  if [[ -n "$OSX_ARCHITECTURES" ]]; then
    CMAKE_FLAGS+=(-DCMAKE_OSX_ARCHITECTURES="$OSX_ARCHITECTURES")
  fi
fi

cmake -S "$LLAMA_CPP_DIR" -B "$BUILD_DIR" "${CMAKE_FLAGS[@]}" "$@"
cmake --build "$BUILD_DIR" --config "$BUILD_TYPE" --target "$TARGET" -j "$BUILD_JOBS"

case "$TARGET" in
  llama-server)
    OUTPUT_BIN="$BUILD_DIR/bin/llama-server"
    if [[ ! -x "$OUTPUT_BIN" ]]; then
      OUTPUT_BIN="$BUILD_DIR/bin/server"
    fi
    ;;
  *)
    OUTPUT_BIN="$BUILD_DIR/bin/$TARGET"
    ;;
esac

if [[ ! -x "$OUTPUT_BIN" ]]; then
  echo "llama.cpp target binary was not produced under $BUILD_DIR/bin: $TARGET" >&2
  exit 1
fi

patch_darwin_rpaths() {
  local runtime_dir="$1"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    return
  fi
  if ! command -v otool >/dev/null 2>&1 || ! command -v install_name_tool >/dev/null 2>&1; then
    echo "otool or install_name_tool was not found; skipping Darwin rpath patch." >&2
    return
  fi

  for file in "$runtime_dir"/*; do
    if [[ ! -f "$file" ]]; then
      continue
    fi
    if [[ "$(basename "$file")" != "llama-server" && "$file" != *.dylib ]]; then
      continue
    fi

    while IFS= read -r rpath; do
      if [[ "$rpath" == /* ]]; then
        install_name_tool -delete_rpath "$rpath" "$file" 2>/dev/null || true
      fi
    done < <(otool -l "$file" | awk '/^[[:space:]]*path / { print $2 }')

    current_rpaths="$(otool -l "$file" | awk '/^[[:space:]]*path / { print $2 }')"
    if ! grep -Fxq "@executable_path" <<<"$current_rpaths"; then
      install_name_tool -add_rpath "@executable_path" "$file" 2>/dev/null || true
    fi
    if ! grep -Fxq "@loader_path" <<<"$current_rpaths"; then
      install_name_tool -add_rpath "@loader_path" "$file" 2>/dev/null || true
    fi
  done
}

if [[ -n "${LLAMA_CPP_INSTALL_DIR:-}" ]]; then
  mkdir -p "$LLAMA_CPP_INSTALL_DIR"
  cp -R "$BUILD_DIR/bin/." "$LLAMA_CPP_INSTALL_DIR/"
  patch_darwin_rpaths "$LLAMA_CPP_INSTALL_DIR"
  chmod +x "$LLAMA_CPP_INSTALL_DIR/llama-server"
  echo "llama.cpp runtime copied to $LLAMA_CPP_INSTALL_DIR"
fi

echo "llama.cpp build output: $OUTPUT_BIN"
