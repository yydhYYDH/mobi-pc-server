#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

LLAMA_CLI="${LLAMA_CLI:-3rdparty/llama.cpp/build-cuda-native/bin/llama-cli}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300s}"
THREADS="${THREADS:-16}"

TARGET_F16="models/Qwen-Qwen3-VL-2B-Instruct-gguf/Qwen-Qwen3-VL-2B-Instruct-f16.gguf"
MMPROJ="models/Qwen-Qwen3-VL-2B-Instruct-gguf/mmproj-Qwen-Qwen3-VL-2B-Instruct-f16.gguf"
DRAFT_F16="models/MNN-Qwen3-VL-2B-Instruct-Eagle3-gguf/MNN-Qwen3-VL-2B-Instruct-Eagle3-f16.gguf"
IMAGE="test/data/example/pics_downsample/mnn_test.jpg"
PROMPT_FILE="test/data/example/prompts/taobao.txt"

COMMON_ARGS=(
  --ctx-size 8192
  --n-gpu-layers 99
  --threads "$THREADS"
  --spec-type draft-eagle3
  --spec-draft-n-max 1
  --spec-draft-n-min 1
  --n-gpu-layers-draft 99
  --temp 0
  --no-display-prompt
  --no-warmup
  --single-turn
  --simple-io
)

run_case() {
  local label="$1"
  shift

  printf '\n== %s ==\n' "$label"
  timeout "$TIMEOUT_SECONDS" "$LLAMA_CLI" "$@"
}

run_case "qwen3vl-taobao-f16-draft-f16" \
  --model "$TARGET_F16" \
  --mmproj "$MMPROJ" \
  --image "$IMAGE" \
  --file "$PROMPT_FILE" \
  "${COMMON_ARGS[@]}" \
  --model-draft "$DRAFT_F16"
