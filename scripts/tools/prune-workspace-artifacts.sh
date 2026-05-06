#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DRY_RUN="${DRY_RUN:-0}"
CONFIRM_PRUNE="${CONFIRM_PRUNE:-}"

if [[ "$DRY_RUN" != "1" && "$CONFIRM_PRUNE" != "YES" ]]; then
  echo "❌ 该脚本会删除工作区产物，请使用 DRY_RUN=1 预览，或显式传入 CONFIRM_PRUNE=YES 执行。"
  exit 1
fi

mkdir -p "$ROOT_DIR/eval/reports"

move_baseline_replay_reports() {
  local source_dir="$ROOT_DIR/docs/verification"
  local target_dir="$ROOT_DIR/eval/reports"
  local moved=0

  shopt -s nullglob
  for file in "$source_dir"/EFFECT-TUNING-REPLAY-*.json "$source_dir"/BASELINE-REPLAY-*.json; do
    local target_file="$target_dir/$(basename "$file")"
    echo "MOVE  $file -> $target_file"
    if [[ "$DRY_RUN" != "1" ]]; then
      mv "$file" "$target_file"
    fi
    moved=1
  done
  shopt -u nullglob

  if [[ "$moved" -eq 0 ]]; then
    echo "SKIP  docs/verification/{EFFECT-TUNING-REPLAY,BASELINE-REPLAY}-*.json"
  fi
}

remove_targets=(
  "$ROOT_DIR/logs"
  "$ROOT_DIR/memory"
)

move_baseline_replay_reports

for target in "${remove_targets[@]}"; do
  if [[ -e "$target" ]]; then
    echo "REMOVE $target"
    if [[ "$DRY_RUN" != "1" ]]; then
      rm -rf "$target"
    fi
  else
    echo "SKIP  $target"
  fi
done

if [[ "$DRY_RUN" == "1" ]]; then
  echo "✅ 预览完成（未执行删除）"
else
  echo "✅ 工作区产物清理完成"
fi
