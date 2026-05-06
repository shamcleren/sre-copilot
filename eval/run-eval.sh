#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORPUS="${SCRIPT_DIR}/corpus.json"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="${SCRIPT_DIR}/reports"
RESULT_FILE="${REPORT_DIR}/results-${TIMESTAMP}.json"

DRY_RUN=false
LIMIT=0
FILTER_LEVEL=""
FILTER_ID=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

usage() {
  cat <<EOF
用法: $(basename "$0") [选项]

说明:
  该脚本已不再执行历史 srectl 远端评估链路。
  当前仅保留 corpus 预览（--dry-run），真实验证请改用 V2 入口。

选项:
  --dry-run              只打印将要覆盖的用例，不实际执行
  --limit N              只展示前 N 个用例
  --level L1|L2|L3|L4    只展示指定难度等级的用例
  --id CASE_ID           只展示指定用例
  -h, --help             显示帮助

推荐入口:
  npm run workflow:verify       # 默认 workflow 验证入口
  npm run runtime:compare       # 历史 baseline compare 观察层
  npm run workflow:refresh      # 默认刷新 readiness 状态页
  npm run workflow:handoff      # 默认刷新 handoff 快照
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --level) FILTER_LEVEL="$2"; shift 2 ;;
    --id) FILTER_ID="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1"; usage ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo -e "${RED}错误: 需要安装 jq${RESET}" >&2
  exit 1
fi

if [[ ! -f "$CORPUS" ]]; then
  echo -e "${RED}错误: 语料库文件不存在: ${CORPUS}${RESET}" >&2
  exit 1
fi

mkdir -p "$REPORT_DIR"

build_case_indices() {
  local query
  query='.cases | to_entries'

  if [[ -n "$FILTER_LEVEL" ]]; then
    query="${query} | map(select(.value.level == \$lv))"
  fi
  if [[ -n "$FILTER_ID" ]]; then
    query="${query} | map(select(.value.id == \$id))"
  fi
  query="${query} | .[].key"

  if [[ -n "$FILTER_LEVEL" && -n "$FILTER_ID" ]]; then
    jq -r --arg lv "$FILTER_LEVEL" --arg id "$FILTER_ID" "$query" "$CORPUS"
  elif [[ -n "$FILTER_LEVEL" ]]; then
    jq -r --arg lv "$FILTER_LEVEL" "$query" "$CORPUS"
  elif [[ -n "$FILTER_ID" ]]; then
    jq -r --arg id "$FILTER_ID" "$query" "$CORPUS"
  else
    jq -r "$query" "$CORPUS"
  fi
}

CASE_INDICES="$(build_case_indices)"
if [[ "$LIMIT" -gt 0 ]]; then
  CASE_INDICES="$(printf '%s\n' "$CASE_INDICES" | head -n "$LIMIT")"
fi

RUN_COUNT=$(printf '%s\n' "$CASE_INDICES" | grep -c . || true)
if [[ "$RUN_COUNT" -eq 0 ]]; then
  echo -e "${YELLOW}没有匹配的用例可展示${RESET}"
  exit 0
fi

if $DRY_RUN; then
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  eval/run-eval.sh（仅保留预览模式）${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  echo -e "  语料版本:   $(jq -r '.version' "$CORPUS")"
  echo -e "  预览数量:   ${RUN_COUNT}"
  [[ -n "$FILTER_LEVEL" ]] && echo -e "  等级过滤:   ${FILTER_LEVEL}"
  [[ -n "$FILTER_ID" ]] && echo -e "  指定用例:   ${FILTER_ID}"
  [[ "$LIMIT" -gt 0 ]] && echo -e "  运行上限:   ${LIMIT}"
  echo -e "  模式:       ${YELLOW}DRY-RUN${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  echo ""

  RESULTS='[]'
  IDX=0
  for ci in $CASE_INDICES; do
    IDX=$((IDX + 1))
    CASE_JSON="$(jq -c ".cases[$ci]" "$CORPUS")"
    CASE_ID="$(printf '%s' "$CASE_JSON" | jq -r '.id')"
    CASE_TITLE="$(printf '%s' "$CASE_JSON" | jq -r '.title')"
    CASE_LEVEL="$(printf '%s' "$CASE_JSON" | jq -r '.level')"
    CASE_USER="$(printf '%s' "$CASE_JSON" | jq -r '.user_id')"
    CASE_PROMPT="$(printf '%s' "$CASE_JSON" | jq -r '.prompt // .question')"
    EXPECTED_KEYS="$(printf '%s' "$CASE_JSON" | jq -r '.expected | keys | join(", ")')"

    echo -e "${BOLD}[${IDX}/${RUN_COUNT}]${RESET} ${CYAN}${CASE_ID}${RESET} ${CASE_TITLE} ${DIM}(${CASE_LEVEL} / ${CASE_USER})${RESET}"
    echo -e "  ${DIM}Q: ${CASE_PROMPT}${RESET}"
    echo -e "  ${DIM}维度: ${EXPECTED_KEYS}${RESET}"
    echo ""

    RESULTS="$(printf '%s' "$RESULTS" | jq \
      --arg id "$CASE_ID" \
      --arg title "$CASE_TITLE" \
      --arg level "$CASE_LEVEL" \
      --arg user "$CASE_USER" \
      --arg prompt "$CASE_PROMPT" \
      '. + [{id:$id,title:$title,level:$level,user_id:$user,status:"dry-run",prompt:$prompt}]')"
  done

  REPORT="$(jq -n \
    --arg ts "$TIMESTAMP" \
    --arg cv "$(jq -r '.version' "$CORPUS")" \
    --argjson results "$RESULTS" \
    '{run_timestamp:$ts, corpus_version:$cv, mode:"dry-run", results:$results}')"
  printf '%s\n' "$REPORT" > "$RESULT_FILE"
  echo -e "${GREEN}预览结果已保存到:${RESET} ${RESULT_FILE}"
  exit 0
fi

cat >&2 <<EOF
${YELLOW}⚠️ eval/run-eval.sh 已退役为“仅预览 corpus”入口，不再执行历史 srectl 远端评估链路。${RESET}

请改用当前 workflow 验证入口：
  - npm run workflow:verify
  - npm run runtime:compare
  - npm run workflow:refresh
  - npm run workflow:handoff

如果你只是想看本次会覆盖哪些 case，请追加 --dry-run。
EOF

REPORT="$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg cv "$(jq -r '.version' "$CORPUS")" \
  --arg level "$FILTER_LEVEL" \
  --arg id "$FILTER_ID" \
  --argjson limit "$LIMIT" \
  --argjson matched "$RUN_COUNT" \
  '{
    run_timestamp:$ts,
    corpus_version:$cv,
    mode:"retired-entry",
    matched_case_count:$matched,
    filters:{level:$level,id:$id,limit:$limit},
    message:"eval/run-eval.sh no longer executes the historical srectl evaluation chain; use workflow:verify / runtime:compare / workflow:refresh / workflow:handoff instead."
  }')"
printf '%s\n' "$REPORT" > "$RESULT_FILE"
echo -e "${DIM}已写入迁移提示:${RESET} ${RESULT_FILE}" >&2
exit 2
