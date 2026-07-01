#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MODEL_DIR="$ROOT_DIR/models/MAI-UI-2B-0422-instruct-1ep_RLv2_4NPUS_bs128_ds5050_step100-MNN-EAGLE-visual-nq-hqq-int4"
LLM_DEMO="$ROOT_DIR/3rdparty/mobiinfer/build_mnn_static/llm_demo"
PROMPT_FILE="$ROOT_DIR/test/data/example/prompts/taobao_mnn.txt"
RESULT_DIR="$ROOT_DIR/test/results/mobiinfer_mai_ui_int4"

mkdir -p "$RESULT_DIR"

run_case() {
  local name="$1"
  local config="$2"
  local output="$RESULT_DIR/${name}.log"

  echo "==> Running ${name}"
  echo "    config: ${config}"
  echo "    prompt: ${PROMPT_FILE}"
  echo "    output: ${output}"

  /usr/bin/time -f "wall_time_sec=%e" \
    -o "$RESULT_DIR/${name}.time" \
    conda run -n mnn "$LLM_DEMO" "$config" "$PROMPT_FILE" \
    2>&1 | tee "$output"
}

if [[ ! -x "$LLM_DEMO" ]]; then
  echo "llm_demo not found or not executable: $LLM_DEMO" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

run_case "config" "$MODEL_DIR/config.json"
run_case "config_no_spec" "$MODEL_DIR/config_no_spec.json"

echo "==> Results written to $RESULT_DIR"
