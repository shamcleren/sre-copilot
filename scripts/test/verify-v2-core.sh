#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

TSX_BIN="$ROOT_DIR/node_modules/.bin/tsx"
TSC_BIN="$ROOT_DIR/node_modules/.bin/tsc"
SUITE_PATH="$ROOT_DIR/v2/eval/specs/replay/effect-tuning-all.v2.json"
TEST_PATH="$ROOT_DIR/v2/tests/runtime-regression.test.ts"
SMOKE_PATH="$ROOT_DIR/v2/tests/smoke.ts"

if [ ! -x "$TSX_BIN" ] || [ ! -x "$TSC_BIN" ]; then
  echo "❌ 缺少根目录 runtime tooling 依赖，请先在 $ROOT_DIR 执行 npm install"
  exit 1
fi

echo "==> V2 TypeScript typecheck"
"$TSC_BIN" -p "$ROOT_DIR/v2/tsconfig.json" --noEmit

echo "==> V2 runtime regression tests"
"$TSX_BIN" --test "$TEST_PATH"

echo "==> V2 smoke"
"$TSX_BIN" "$SMOKE_PATH"

echo "==> V2 replay suite"
"$TSX_BIN" "$ROOT_DIR/v2/eval/runners/replay-runner.ts" --cases "$SUITE_PATH"

echo "✅ V2 core regression verify passed"
