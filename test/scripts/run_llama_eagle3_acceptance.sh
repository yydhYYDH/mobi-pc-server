#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

LLAMA_CLI="${LLAMA_CLI:-3rdparty/llama.cpp/build-cuda-native/bin/llama-cli}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300s}"
THREADS="${THREADS:-16}"

TARGET_Q4="models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16-q4_k_m.gguf"
TARGET_F16="models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf"
MMPROJ="models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-gguf/mmproj-mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-base-f16.gguf"
IMAGE="test/data/example/pics_downsample/chat1.jpg"

DRAFT_Q4="models/mai-ui-2b-0422-eagle3-base-pred1-ep1-gguf/mai-ui-2b-0422-eagle3-base-pred1-ep1-f16-q4_k_m.gguf"
DRAFT_F16="models/mai-ui-2b-0422-eagle3-base-pred1-ep1-gguf/mai-ui-2b-0422-eagle3-base-pred1-ep1-f16.gguf"

COMMON_ARGS=(
  --ctx-size 8192
  --n-gpu-layers 0
  --threads "$THREADS"
  --spec-type draft-eagle3
  --spec-draft-n-max 1
  --spec-draft-n-min 1
  --n-gpu-layers-draft 0
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

run_case "image-q4-draft-q4-predict-16" \
  --model "$TARGET_Q4" \
  --mmproj "$MMPROJ" \
  --image "$IMAGE" \
  --prompt '请用一句话描述这张图片。' \
  --predict 16 \
  "${COMMON_ARGS[@]}" \
  --model-draft "$DRAFT_Q4" \
  --no-mmproj-offload

run_case "image-q4-draft-q4-predict-64" \
  --model "$TARGET_Q4" \
  --mmproj "$MMPROJ" \
  --image "$IMAGE" \
  --prompt '请用一句话描述这张图片。' \
  --predict 64 \
  "${COMMON_ARGS[@]}" \
  --model-draft "$DRAFT_Q4" \
  --no-mmproj-offload

run_case "text-q4-draft-q4-predict-64" \
  --model "$TARGET_Q4" \
  --prompt '请用一句话介绍上海交通大学。' \
  --predict 64 \
  "${COMMON_ARGS[@]}" \
  --model-draft "$DRAFT_Q4"

run_case "text-f16-draft-f16-predict-64" \
  --model "$TARGET_F16" \
  --prompt '请用一句话介绍上海交通大学。' \
  --predict 64 \
  "${COMMON_ARGS[@]}" \
  --model-draft "$DRAFT_F16"
