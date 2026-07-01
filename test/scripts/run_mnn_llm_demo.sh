#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LLM_DEMO="$ROOT_DIR/3rdparty/mobiinfer/build_mnn_static/llm_demo"
MODEL_CONFIG="/mnt/e/WAIC/pc_server/models/Qwen3.5-0.8B-MNN/config.json"
# MODEL_CONFIG="$ROOT_DIR/models/mai-ui-2b-0422-instruct-1ep-rlv2-4npus-bs128-ds5050-step100-w8g128-mnn/config.json"
IMAGE_NAME="${1:-chat1.jpg}"
PROMPT_TEXT="${2:-请用一句话描述这张图片。}"
MAX_TOKENS="${3:-64}"
IMAGE_PATH="$ROOT_DIR/test/data/example/pics/$IMAGE_NAME"
PROMPT_FILE="/tmp/mai-ui-mnn-${IMAGE_NAME%.*}-prompt.txt"

printf '<img>%s</img>%s\n' "$IMAGE_PATH" "$PROMPT_TEXT" > "$PROMPT_FILE"
"$LLM_DEMO" "$MODEL_CONFIG" "$PROMPT_FILE" "$MAX_TOKENS"
