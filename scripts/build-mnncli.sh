#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MNN_DIR="$ROOT_DIR/3rdparty/MNN"
MNNCLI_DIR="$MNN_DIR/apps/mnncli"
MNNCLI_BIN="$MNNCLI_DIR/build_mnncli/mnncli"

if [[ ! -f "$MNNCLI_DIR/build.sh" ]]; then
  echo "Missing MNN mnncli build script: $MNNCLI_DIR/build.sh" >&2
  exit 1
fi

(
  cd "$MNNCLI_DIR"
  ./build.sh "$@"
)

if [[ ! -x "$MNNCLI_BIN" ]]; then
  echo "mnncli was not produced at $MNNCLI_BIN" >&2
  exit 1
fi

echo "mnncli build output: $MNNCLI_BIN"
