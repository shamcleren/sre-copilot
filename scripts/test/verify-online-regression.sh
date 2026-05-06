#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-dev}"
REMOTE_PATH="${REMOTE_PATH:-/data/sre-copilot}"
REMOTE_SERVICE_PORT="${REMOTE_SERVICE_PORT:-3900}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
REPORT_DIR="$ROOT_DIR/docs/verification"
TS="$(date +%Y%m%d-%H%M)"
REPORT_FILE="${REPORT_FILE:-$REPORT_DIR/ONLINE-VERIFY-$TS.MD}"
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t sre-online-verify)"

PASS_COUNT=0
FAIL_COUNT=0

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ -z "$AUTH_TOKEN" ] && [ -f "$ROOT_DIR/.env.admin-token" ]; then
  AUTH_TOKEN="$(sed -n 's/^AUTH_TOKEN=//p' "$ROOT_DIR/.env.admin-token" | tail -n1 | tr -d '\r')"
fi

if [ -z "$AUTH_TOKEN" ]; then
  echo "❌ 缺少 AUTH_TOKEN（环境变量或 .env.admin-token）"
  exit 2
fi

mkdir -p "$REPORT_DIR"

write_header() {
  cat > "$REPORT_FILE" <<EOF
# 线上部署与回归验收报告（统一模板）

## 验收目标

- 目标：验证远端当前版本的部署状态与关键线上链路
- 入口：\`make verify-online\`

## 环境信息

- 时间：$(date "+%F %T %Z")
- REMOTE_HOST：$REMOTE_HOST
- REMOTE_PATH：$REMOTE_PATH
- REMOTE_SERVICE_PORT：$REMOTE_SERVICE_PORT
- AUTH_TOKEN：provided

## 执行步骤与证据

EOF
}

append_report() {
  local step_name="$1"
  local rc="$2"
  local note="$3"
  local log_file="$4"
  {
    echo "### $step_name"
    echo
    echo "- exit_code: $rc"
    if [ -n "$note" ]; then
      echo "- note: $note"
    fi
    echo
    echo '```'
    if [ -s "$log_file" ]; then
      cat "$log_file"
    else
      echo "(no log output)"
    fi
    echo '```'
    echo
  } >> "$REPORT_FILE"
}

append_footer() {
  local conclusion="PASS"
  if [ "$FAIL_COUNT" -gt 0 ]; then
    conclusion="FAIL"
  fi
  {
    echo "## 结果判定"
    echo
    echo "- 结论: $conclusion"
    echo "- 通过: $PASS_COUNT"
    echo "- 失败: $FAIL_COUNT"
    echo "- 报告: $REPORT_FILE"
    echo
  } >> "$REPORT_FILE"
}

run_step() {
  local step_id="$1"
  local step_name="$2"
  local cmd="$3"
  local attempts="${4:-1}"
  local log_file="$TMP_DIR/$step_id.log"
  local rc=0
  local note=""
  local attempt=1

  echo "▶ $step_name"
  : >"$log_file"
  while [ "$attempt" -le "$attempts" ]; do
    if eval "$cmd" >>"$log_file" 2>&1; then
      PASS_COUNT=$((PASS_COUNT + 1))
      echo "✅ $step_name"
      append_report "$step_name" "$rc" "$note" "$log_file"
      return 0
    fi
    rc=$?
    note="step_failed_attempt_${attempt}"
    if [ "$attempt" -lt "$attempts" ]; then
      echo "↻ $step_name 重试 ($attempt/$attempts)" >>"$log_file"
      sleep 3
    fi
    attempt=$((attempt + 1))
  done

  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "❌ $step_name"
  tail -n 40 "$log_file" || true
  append_report "$step_name" "$rc" "$note" "$log_file"
  return "$rc"
}

remote_with_port_forward() {
  local inner="$1"
  local token_escaped
  token_escaped="$(printf '%s' "$AUTH_TOKEN" | sed "s/'/'\\\\''/g")"
  ssh "$REMOTE_HOST" "/bin/bash -lc 'cd $REMOTE_PATH; TOKEN='\''$token_escaped'\''; kubectl port-forward -n sre-copilot svc/sre-copilot-service $REMOTE_SERVICE_PORT:80 >/tmp/sre-copilot-pf.log 2>&1 & PF_PID=\$!; trap \"kill \$PF_PID >/dev/null 2>&1 || true\" EXIT; sleep 5; $inner'"
}

write_header

run_step "deployment_meta" "远端部署元数据" \
  "ssh $REMOTE_HOST \"kubectl get deployment sre-copilot-app -n sre-copilot -o jsonpath='{.spec.template.spec.containers[0].image}' && printf '\\n' && kubectl get deployment sre-copilot-app -n sre-copilot -o jsonpath='{.status.readyReplicas}/{.status.replicas}' && printf '\\n\\n' && kubectl get pods -n sre-copilot -l app=sre-copilot -o wide\"" \
  2

run_step "health" "集群内健康检查" \
  "remote_with_port_forward 'curl -sS http://127.0.0.1:$REMOTE_SERVICE_PORT/health'" \
  4

run_step "token_phase" "Token 三段链路接口" \
  "remote_with_port_forward 'curl -sS -H \"Authorization: Bearer \$TOKEN\" http://127.0.0.1:$REMOTE_SERVICE_PORT/api/admin/token-usage/phase-breakdown'" \
  4

run_step "llm_cross_options" "LLM 交叉测试模型选项接口" \
  "remote_with_port_forward 'curl -sS -H \"Authorization: Bearer \$TOKEN\" http://127.0.0.1:$REMOTE_SERVICE_PORT/api/admin/llm-cross-test/options | tee /tmp/sre-copilot-cross-options.json | grep -q \"\\\"providers\\\"\"'" \
  4

run_step "llm_cross_smoke" "LLM 交叉测试接口冒烟" \
  "remote_with_port_forward 'curl -sS -H \"Authorization: Bearer \$TOKEN\" -H \"Content-Type: application/json\" -X POST http://127.0.0.1:$REMOTE_SERVICE_PORT/api/admin/llm-cross-test --data \"{\\\"prompt\\\":\\\"请用一句话说明当前模型连通性检查用途\\\"}\" | tee /tmp/sre-copilot-cross-test.json | grep -q \"\\\"success\\\":true\"'" \
  4

run_step "expert_diag" "专家排障入口回归（显式 V2 + route runtime）" \
  "remote_with_port_forward 'BASE_URL=http://127.0.0.1:$REMOTE_SERVICE_PORT AUTH_TOKEN=\$TOKEN CHAT_ROUTE=v2 EXPECT_ROUTE=v2 REQUIRE_NO_FALLBACK=1 REQUIRE_V2_RUNTIME=1 VERIFY_ROUTE_RUNTIME_SUMMARY=1 timeout 240s node $REMOTE_PATH/scripts/test/test-expert-diagnosis-entry.js'" \
  3

run_step "effect_tuning_gate" "效果调优最小回放守门（A/B/C/D/E）" \
  "remote_with_port_forward 'BASE_URL=http://127.0.0.1:$REMOTE_SERVICE_PORT AUTH_TOKEN=\$TOKEN CASES_FILE=$REMOTE_PATH/eval/effect-tuning-release-gate.json timeout 300s node $REMOTE_PATH/scripts/test/test-effect-tuning-replay.js'" \
  2

append_footer

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
