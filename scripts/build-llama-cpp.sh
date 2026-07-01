#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LLAMA_CPP_DIR="$ROOT_DIR/3rdparty/llama.cpp"
BUILD_TYPE="${LLAMA_CPP_BUILD_TYPE:-Release}"
BUILD_MODE="${LLAMA_CPP_BUILD_MODE:-cuda}"
BUILD_JOBS="${LLAMA_CPP_BUILD_JOBS:-16}"
BUILD_DIR="${LLAMA_CPP_BUILD_DIR:-}"
CUDA_ARCH="${LLAMA_CPP_CUDA_ARCH:-89}"
TARGET="${LLAMA_CPP_TARGET:-llama-server}"

if [[ ! -f "$LLAMA_CPP_DIR/CMakeLists.txt" ]]; then
  echo "Missing llama.cpp source at $LLAMA_CPP_DIR." >&2
  echo "Run: git submodule update --init --depth 1 3rdparty/llama.cpp" >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake was not found on PATH." >&2
  exit 1
fi

case "$BUILD_MODE" in
  cuda)
    BUILD_DIR="${BUILD_DIR:-$LLAMA_CPP_DIR/build-cuda-native}"
    CMAKE_FLAGS=(
      -DGGML_CUDA=ON
      -DGGML_NATIVE=ON
      -DCMAKE_CUDA_ARCHITECTURES="$CUDA_ARCH"
      -DLLAMA_BUILD_UI=OFF
      -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
    )
    ;;
  cpu)
    BUILD_DIR="${BUILD_DIR:-$LLAMA_CPP_DIR/build}"
    CMAKE_FLAGS=(
      -DGGML_NATIVE=ON
      -DLLAMA_BUILD_UI=OFF
      -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
    )
    ;;
  *)
    echo "Unsupported LLAMA_CPP_BUILD_MODE=$BUILD_MODE. Use 'cuda' or 'cpu'." >&2
    exit 1
    ;;
esac

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

echo "llama.cpp build output: $OUTPUT_BIN"
