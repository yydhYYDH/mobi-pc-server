#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LLAMA_CPP_DIR="${LLAMA_CPP_DIR:-$ROOT_DIR/3rdparty/llama.cpp}"
BUILD_DIR="${LLAMA_CPP_BUILD_DIR:-$LLAMA_CPP_DIR/build-cuda-native}"
QUANTIZE_BIN="${LLAMA_QUANTIZE_BIN:-$BUILD_DIR/bin/llama-quantize}"
CONVERT_SCRIPT="$LLAMA_CPP_DIR/convert_hf_to_gguf.py"
GGUF_PY="$LLAMA_CPP_DIR/gguf-py"

if [[ -x /home/yydh/miniconda3/envs/mnn/bin/python ]]; then
  DEFAULT_PYTHON=/home/yydh/miniconda3/envs/mnn/bin/python
else
  DEFAULT_PYTHON=python
fi

PYTHON_BIN="${LLAMA_CPP_PYTHON:-${PYTHON:-$DEFAULT_PYTHON}}"
MODEL_PATH=""
OUT_DIR=""
FP_GGUF=""
QUANT_GGUF=""
QUANT_TYPE="${LLAMA_QUANT_TYPE:-Q4_K_M}"
OUTTYPE="${LLAMA_GGUF_OUTTYPE:-bf16}"
MODEL_NAME=""
MMProj=0
KEEP_FP=0
CONVERT_EXTRA=()
QUANT_EXTRA=()

usage() {
  cat <<'EOF'
Usage:
  scripts/quantize-llama-cpp.sh --model PATH [options]
  scripts/quantize-llama-cpp.sh --gguf PATH [options]

Inputs:
  --model PATH             HuggingFace/ModelScope torch model directory with safetensors/bin weights.
  --gguf PATH              Existing high precision GGUF. Skips HF -> GGUF conversion.

Output options:
  --out-dir PATH           Output directory. Default: models/<model-name>-gguf
  --fp-gguf PATH           Intermediate high precision GGUF path.
  --out PATH               Final quantized GGUF path.
  --quant TYPE             llama.cpp quant type. Default: Q4_K_M.
  --outtype TYPE           convert_hf_to_gguf outtype: f32, f16, bf16, q8_0, auto. Default: bf16.
  --model-name NAME        Base file name. Default: input directory/file name.
  --mmproj                 Convert multimodal projector instead of the text trunk.
  --keep-fp                Keep the intermediate FP GGUF after quantization.

Advanced:
  --convert-arg ARG        Extra arg passed to convert_hf_to_gguf.py. Repeatable.
  --quant-arg ARG          Extra arg passed to llama-quantize. Repeatable.

Environment:
  LLAMA_CPP_PYTHON         Python with torch/safetensors/transformers. Default: /home/yydh/miniconda3/envs/mnn/bin/python.
  LLAMA_CPP_BUILD_DIR      llama.cpp build dir. Default: 3rdparty/llama.cpp/build-cuda-native.
  LLAMA_QUANTIZE_BIN       llama-quantize path. Default: <build-dir>/bin/llama-quantize.
  LLAMA_QUANT_TYPE         Default quant type. Default: Q4_K_M.
  LLAMA_GGUF_OUTTYPE       Default conversion outtype. Default: bf16.

Examples:
  scripts/quantize-llama-cpp.sh --model models/Qwen3.5-0.8B --quant Q4_K_M
  scripts/quantize-llama-cpp.sh --gguf models/foo/foo-bf16.gguf --out models/foo/foo-Q4_K_M.gguf
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)
      MODEL_PATH="$2"
      shift 2
      ;;
    --gguf)
      FP_GGUF="$2"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    --fp-gguf)
      FP_GGUF="$2"
      shift 2
      ;;
    --out)
      QUANT_GGUF="$2"
      shift 2
      ;;
    --quant)
      QUANT_TYPE="$2"
      shift 2
      ;;
    --outtype)
      OUTTYPE="$2"
      shift 2
      ;;
    --model-name)
      MODEL_NAME="$2"
      shift 2
      ;;
    --mmproj)
      MMProj=1
      shift
      ;;
    --keep-fp)
      KEEP_FP=1
      shift
      ;;
    --convert-arg)
      CONVERT_EXTRA+=("$2")
      shift 2
      ;;
    --quant-arg)
      QUANT_EXTRA+=("$2")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$MODEL_PATH" && -z "$FP_GGUF" ]]; then
  echo "Either --model or --gguf is required." >&2
  usage >&2
  exit 1
fi

if [[ ! -x "$QUANTIZE_BIN" ]]; then
  echo "Missing llama-quantize binary: $QUANTIZE_BIN" >&2
  echo "Run: LLAMA_CPP_TARGET=llama-quantize scripts/build-llama-cpp.sh" >&2
  exit 1
fi

if [[ -n "$MODEL_PATH" && ! -d "$MODEL_PATH" ]]; then
  echo "Model directory does not exist: $MODEL_PATH" >&2
  exit 1
fi

if [[ -n "$FP_GGUF" && "$FP_GGUF" == *.gguf && ! -f "$FP_GGUF" && -z "$MODEL_PATH" ]]; then
  echo "GGUF file does not exist: $FP_GGUF" >&2
  exit 1
fi

if [[ -z "$MODEL_NAME" ]]; then
  if [[ -n "$MODEL_PATH" ]]; then
    MODEL_NAME="$(basename "$(realpath "$MODEL_PATH")")"
  else
    MODEL_NAME="$(basename "$FP_GGUF" .gguf)"
  fi
fi

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="$ROOT_DIR/models/${MODEL_NAME}-gguf"
fi
mkdir -p "$OUT_DIR"

if [[ -z "$FP_GGUF" ]]; then
  prefix=""
  if [[ "$MMProj" -eq 1 ]]; then
    prefix="mmproj-"
  fi
  FP_GGUF="$OUT_DIR/${prefix}${MODEL_NAME}-${OUTTYPE}.gguf"
fi

if [[ -z "$QUANT_GGUF" ]]; then
  quant_suffix="$(echo "$QUANT_TYPE" | tr '[:upper:]' '[:lower:]')"
  base_name="$(basename "$FP_GGUF" .gguf)"
  QUANT_GGUF="$OUT_DIR/${base_name}-${quant_suffix}.gguf"
fi

if [[ -n "$MODEL_PATH" && ! -f "$FP_GGUF" ]]; then
  if [[ ! -f "$CONVERT_SCRIPT" ]]; then
    echo "Missing convert_hf_to_gguf.py at $CONVERT_SCRIPT" >&2
    exit 1
  fi
  CONVERT_CMD=(
    "$PYTHON_BIN" "$CONVERT_SCRIPT"
    "$(realpath "$MODEL_PATH")"
    --outfile "$(realpath -m "$FP_GGUF")"
    --outtype "$OUTTYPE"
  )
  if [[ "$MMProj" -eq 1 ]]; then
    CONVERT_CMD+=(--mmproj)
  fi
  CONVERT_CMD+=("${CONVERT_EXTRA[@]}")

  echo "Converting HF safetensors model to GGUF:"
  printf '  %q' "${CONVERT_CMD[@]}"
  echo
  PYTHONPATH="$GGUF_PY${PYTHONPATH:+:$PYTHONPATH}" "${CONVERT_CMD[@]}"
fi

QUANT_CMD=(
  "$QUANTIZE_BIN"
  "${QUANT_EXTRA[@]}"
  "$(realpath "$FP_GGUF")"
  "$(realpath -m "$QUANT_GGUF")"
  "$QUANT_TYPE"
)

echo "Quantizing GGUF:"
printf '  %q' "${QUANT_CMD[@]}"
echo
"${QUANT_CMD[@]}"

if [[ "$KEEP_FP" -eq 0 && -n "$MODEL_PATH" && -f "$FP_GGUF" ]]; then
  rm -f "$FP_GGUF"
fi

echo "Quantized GGUF: $QUANT_GGUF"
