#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MNN_DIR="$ROOT_DIR/3rdparty/MNN"
BUILD_DIR="$MNN_DIR/apps/mnncli/build"

cmake -S "$MNN_DIR/apps/mnncli" -B "$BUILD_DIR"
cmake --build "$BUILD_DIR" --config Release

echo "mnncli build output: $BUILD_DIR"
