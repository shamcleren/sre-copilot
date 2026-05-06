#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

TSX_BIN="$ROOT_DIR/node_modules/.bin/tsx"

if [ ! -x "$TSX_BIN" ]; then
  echo "❌ 缺少根目录 runtime tooling 依赖，请先在 $ROOT_DIR 执行 npm install"
  exit 1
fi

RUN_V2_COMPARE_VERIFY="${RUN_V2_COMPARE_VERIFY:-${RUN_V2_COMPAT_VERIFY:-0}}"
CORE_VERIFY_PASSED=0
COMPARE_VERIFY_PASSED=0
COMPARE_VERIFY_ATTEMPTED=0

echo "==> V2 core verify"
if bash "$ROOT_DIR/scripts/test/verify-v2-core.sh"; then
  CORE_VERIFY_PASSED=1
fi

if [ "$RUN_V2_COMPARE_VERIFY" = "1" ]; then
  echo "ℹ️ compare 观察层当前按需执行，请使用 npm run runtime:compare 单独刷新 compare 报告"
  COMPARE_VERIFY_ATTEMPTED=1
  COMPARE_VERIFY_PASSED=0
else
  echo "ℹ️ 默认跳过历史 compare 观察层刷新；当前 readiness 以 pure V2 core/baseline 为主"
fi

READINESS_ARGS=()
if [ "$CORE_VERIFY_PASSED" = "1" ]; then
  READINESS_ARGS+=("--core-verify-passed" "--verify-passed")
fi
if [ "$COMPARE_VERIFY_ATTEMPTED" = "1" ]; then
  READINESS_ARGS+=("--compare-verify-attempted")
fi
if [ "$COMPARE_VERIFY_PASSED" = "1" ]; then
  READINESS_ARGS+=("--compare-verify-passed")
fi

echo "==> V2 readiness status"
if [ ${#READINESS_ARGS[@]} -gt 0 ]; then
  "$TSX_BIN" "$ROOT_DIR/v2/eval/runners/readiness-status.ts" "${READINESS_ARGS[@]}"
else
  "$TSX_BIN" "$ROOT_DIR/v2/eval/runners/readiness-status.ts"
fi

echo "==> Project context snapshot"
"$TSX_BIN" "$ROOT_DIR/v2/eval/runners/project-context-status.ts"

if [ "$CORE_VERIFY_PASSED" != "1" ]; then
  echo "❌ V2 readiness baseline failed: core=$CORE_VERIFY_PASSED compare=$COMPARE_VERIFY_PASSED"
  exit 1
fi

if [ "$COMPARE_VERIFY_ATTEMPTED" = "1" ] && [ "$COMPARE_VERIFY_PASSED" != "1" ]; then
  echo "⚠️ V2 readiness status generated with compare warning: core=$CORE_VERIFY_PASSED compare=$COMPARE_VERIFY_PASSED"
fi
