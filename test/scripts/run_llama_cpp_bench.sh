#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

python "$ROOT_DIR/test/scripts/benchmark_mai_ui_qwen3vl_gguf.py" "$@"
