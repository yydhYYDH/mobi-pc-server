#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MOBIINFER_DIR="$ROOT_DIR/3rdparty/mobiinfer"
MNNCLI_DIR="$MOBIINFER_DIR/apps/mnncli"
MOBIINFER_BIN="$MNNCLI_DIR/build_mnncli/mnncli"

if [[ ! -f "$MNNCLI_DIR/build.sh" ]]; then
  echo "Missing MobiInfer mnncli build script: $MNNCLI_DIR/build.sh" >&2
  exit 1
fi

(
  cd "$MNNCLI_DIR"
  ./build.sh "$@"
)

if [[ ! -x "$MOBIINFER_BIN" ]]; then
  echo "mnncli was not produced at $MOBIINFER_BIN" >&2
  exit 1
fi

echo "MobiInfer build output: $MOBIINFER_BIN"
