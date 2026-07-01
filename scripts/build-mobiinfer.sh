#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MOBIINFER_DIR="$ROOT_DIR/3rdparty/mobiinfer"
MNN_BUILD_DIR="$MOBIINFER_DIR/build_mnn_static"
MNNCLI_DIR="$MOBIINFER_DIR/apps/mnncli"
MNNCLI_BUILD_DIR="$MNNCLI_DIR/build_mnncli"

if [[ "${1:-}" == "--clean" ]]; then
  rm -rf "$MNN_BUILD_DIR" "$MNNCLI_BUILD_DIR"
fi

mkdir -p "$MNN_BUILD_DIR" "$MNNCLI_BUILD_DIR"

cmake -S "$MOBIINFER_DIR" -B "$MNN_BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DMNN_BUILD_SHARED_LIBS=OFF \
  -DMNN_BUILD_CONVERTER=ON \
  -DMNN_BUILD_LLM=ON \
  -DMNN_BUILD_LLM_OMNI=ON \
  -DMNN_LOW_MEMORY=ON \
  -DMNN_CPU_WEIGHT_DEQUANT_GEMM=ON \
  -DMNN_SUPPORT_TRANSFORMER_FUSE=ON \
  -DMNN_AVX512=ON \
  -DLLM_SUPPORT_VISION=ON \
  -DMNN_BUILD_OPENCV=ON \
  -DMNN_IMGCODECS=ON \
  -DMNN_SEP_BUILD=OFF \
  -DMNN_USE_OPENCV=ON \

cmake --build "$MNN_BUILD_DIR" --parallel

cmake -S "$MNNCLI_DIR" -B "$MNNCLI_BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DMNN_BUILD_DIR="$MNN_BUILD_DIR" \
  -DMNN_SOURCE_DIR="$MOBIINFER_DIR"

cmake --build "$MNNCLI_BUILD_DIR" --parallel

echo "MNNConvert:"
find "$MNN_BUILD_DIR" -maxdepth 3 -name MNNConvert | sed -n '1,5p'

echo "mnncli:"
echo "${MNNCLI_BUILD_DIR}/mnncli"
