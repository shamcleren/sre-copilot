#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERIFY_DIR="${ROOT_DIR}/docs/verification"

if [[ ! -d "${VERIFY_DIR}" ]]; then
  echo "❌ 未找到目录: ${VERIFY_DIR}"
  exit 1
fi

DRY_RUN="${DRY_RUN:-0}"
TOTAL_DELETED=0

delete_file() {
  local path="$1"
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "DRY-RUN delete: ${path}"
    return 0
  fi
  if [[ -f "${path}" ]]; then
    rm -f "${path}"
    echo "deleted: ${path}"
    TOTAL_DELETED=$((TOTAL_DELETED + 1))
  fi
}

prune_simple() {
  local pattern="$1"
  local keep="$2"
  local files=()
  local f
  while IFS= read -r f; do
    files+=("${f}")
  done < <(ls -1 "${VERIFY_DIR}"/${pattern} 2>/dev/null | sort || true)
  local count="${#files[@]}"
  if (( count <= keep )); then
    echo "keep: ${pattern} (${count}/${keep})"
    return 0
  fi

  local remove_count=$((count - keep))
  echo "prune: ${pattern} remove=${remove_count} keep=${keep}"
  for ((i = 0; i < remove_count; i++)); do
    delete_file "${files[$i]}"
  done
}

prune_pair_by_stem() {
  local stem_prefix="$1"
  local keep="$2"
  local md_glob="${VERIFY_DIR}/${stem_prefix}*.MD"
  local json_glob="${VERIFY_DIR}/${stem_prefix}*.JSON"

  local stems=()
  local s
  while IFS= read -r s; do
    stems+=("${s}")
  done < <(
    {
      ls -1 ${md_glob} 2>/dev/null || true
      ls -1 ${json_glob} 2>/dev/null || true
    } | sed -E 's/\.(MD|JSON)$//' | sort -u
  )

  local count="${#stems[@]}"
  if (( count <= keep )); then
    echo "keep pair: ${stem_prefix}* (${count}/${keep})"
    return 0
  fi

  local remove_count=$((count - keep))
  echo "prune pair: ${stem_prefix}* remove=${remove_count} keep=${keep}"
  for ((i = 0; i < remove_count; i++)); do
    delete_file "${stems[$i]}.MD"
    delete_file "${stems[$i]}.JSON"
  done
}

echo "== verify artifacts prune =="
echo "verify_dir=${VERIFY_DIR}"
echo "dry_run=${DRY_RUN}"

# 单文件滚动保留
prune_simple "LOCAL-VERIFY-*.MD" 5
prune_simple "PLAYBOOK-COVERAGE-VERIFY-*.MD" 5
prune_simple "FULL-TEST-RUN-*.MD" 5
prune_simple "ONLINE-VERIFY-*.MD" 5
prune_simple "BROWSER-LIVE-*.json" 1
prune_simple "EXPERT-DIAGNOSIS-ENTRY-*.JSON" 3
prune_simple "BROWSER-P3-POLICY-*.JSON" 3

# MD/JSON 成对滚动保留
prune_pair_by_stem "BROWSER-REGRESSION-" 6
prune_pair_by_stem "CHATOPS-PARSE-MATRIX-" 3
prune_pair_by_stem "LLM-CROSS-BENCHMARK-" 3

echo "done. deleted=${TOTAL_DELETED}"
