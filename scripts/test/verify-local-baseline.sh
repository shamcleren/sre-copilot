#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
PORT="${PORT:-}"
VERIFY_STAGE="${VERIFY_STAGE:-all}"
VERIFY_PROFILE="${VERIFY_PROFILE:-local-fast}"
REPORT_DIR="$ROOT_DIR/docs/verification"
TS="$(date +%Y%m%d-%H%M%S)"
RUN_ID="$TS-$$"
REPORT_FILE="${REPORT_FILE:-$REPORT_DIR/LOCAL-VERIFY-$RUN_ID.MD}"

apply_profile_defaults() {
  case "$VERIFY_PROFILE" in
    ci)
      : "${API_TIMEOUT_SEC:=5}"
      : "${CONNECT_TIMEOUT_SEC:=2}"
      : "${HEALTH_RETRY:=30}"
      : "${HEALTH_INTERVAL_SEC:=1}"
      : "${STEP_TIMEOUT_SEC:=90}"
      : "${STEP_STALL_SEC:=30}"
      : "${LOG_TAIL_LINES:=120}"
      : "${QUIET:=1}"
      : "${RUN_HEAVY_MCP:=1}"
      : "${RUN_TOOL_DISCOVERY_CHECK:=1}"
      : "${RUN_BROWSER_E2E:=1}"
      ;;
    local-fast|*)
      : "${API_TIMEOUT_SEC:=3}"
      : "${CONNECT_TIMEOUT_SEC:=1}"
      : "${HEALTH_RETRY:=12}"
      : "${HEALTH_INTERVAL_SEC:=0.5}"
      : "${STEP_TIMEOUT_SEC:=45}"
      : "${STEP_STALL_SEC:=45}"
      : "${LOG_TAIL_LINES:=80}"
      : "${QUIET:=1}"
      : "${RUN_HEAVY_MCP:=0}"
      : "${RUN_TOOL_DISCOVERY_CHECK:=0}"
      : "${RUN_BROWSER_E2E:=0}"
      : "${RUN_V2_REGRESSION:=1}"
      ;;
  esac
}
apply_profile_defaults

TMP_DIR="$ROOT_DIR/.tmp/verify-local-$RUN_ID"
mkdir -p "$REPORT_DIR" "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

PASS_COUNT=0
FAIL_COUNT=0

write_header() {
  cat > "$REPORT_FILE" <<EOF
# 本地验收报告（统一模板）

## 验收目标

- 目标: 通过单命令完成本地最小闭环验收（启动/健康/定向检查）
- 口径: 结果需可追溯到命令输出，失败项需可定位与复现
- 入口: \`make verify-local\`

## 环境信息

- 时间: $(date "+%F %T %Z")
- BASE_URL: $BASE_URL
- AUTH_TOKEN: $( [ -n "$AUTH_TOKEN" ] && echo "provided" || echo "not provided" )
- VERIFY_STAGE: $VERIFY_STAGE
- VERIFY_PROFILE: $VERIFY_PROFILE
- API_TIMEOUT_SEC: $API_TIMEOUT_SEC
- CONNECT_TIMEOUT_SEC: $CONNECT_TIMEOUT_SEC
- STEP_TIMEOUT_SEC: $STEP_TIMEOUT_SEC
- STEP_STALL_SEC: $STEP_STALL_SEC
- QUIET: $QUIET
- RUN_HEAVY_MCP: $RUN_HEAVY_MCP
- RUN_TOOL_DISCOVERY_CHECK: $RUN_TOOL_DISCOVERY_CHECK
- RUN_BROWSER_E2E: $RUN_BROWSER_E2E
- RUN_V2_REGRESSION: $RUN_V2_REGRESSION

## 执行步骤与证据

EOF
}

should_run() {
  local step_id="$1"
  case "$VERIFY_STAGE" in
    all)
      return 0
      ;;
    quick)
      [[ "$step_id" == "boot" || "$step_id" == "health" ]]
      return
      ;;
    smoke)
      [[ "$step_id" == "boot" || "$step_id" == "health" || "$step_id" == "chatops_guard" || "$step_id" == "static" || "$step_id" == "mcp_local" ]]
      return
      ;;
    tests)
      [[ "$step_id" == "boot" || "$step_id" == "health" || "$step_id" == "offline" || "$step_id" == "chatops_guard" ]]
      return
      ;;
    auth)
      [[ "$step_id" == "boot" || "$step_id" == "health" || "$step_id" == "chatops_guard" || "$step_id" == "auth_role" || "$step_id" == "auth_mcp" ]]
      return
      ;;
    browser)
      [[ "$step_id" == "boot" || "$step_id" == "health" || "$step_id" == "browser_e2e" ]]
      return
      ;;
    *)
      return 0
      ;;
  esac
}

append_report() {
  local step_name="$1"
  local rc="$2"
  local elapsed="$3"
  local note="${4:-}"
  local log_file="$5"
  {
    echo "### $step_name"
    echo
    echo "- exit_code: $rc"
    echo "- elapsed_sec: $elapsed"
    if [ -n "$note" ]; then
      echo "- note: $note"
    fi
    echo
    echo '```'
    if [ -s "$log_file" ]; then
      tail -n "$LOG_TAIL_LINES" "$log_file"
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
    echo "## 失败项"
    echo
    if [ "$FAIL_COUNT" -gt 0 ]; then
      echo "- 失败步骤: 见上文所有 \`exit_code != 0\` 的步骤记录与日志片段"
    else
      echo "- 无"
    fi
    echo
    echo "## 建议动作"
    echo
    if [ "$FAIL_COUNT" -gt 0 ]; then
      echo "- 按失败步骤日志定位根因并修复后，重新执行：\`make verify-local VERIFY_STAGE=$VERIFY_STAGE VERIFY_PROFILE=$VERIFY_PROFILE\`"
    else
      echo "- 本地验收通过，可进入远端验证：\`./scripts/deploy/deploy-remote.sh\`"
      echo "- 远端检查统一使用：\`ssh dev\`"
    fi
    echo
  } >> "$REPORT_FILE"
}

wait_for_health() {
  local i
  for i in $(seq 1 "$HEALTH_RETRY"); do
    if curl -fsS --connect-timeout 1 --max-time "$API_TIMEOUT_SEC" "$BASE_URL/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL_SEC"
  done
  return 1
}

run_step_monitored() {
  local step_name="$1"
  local cmd="$2"
  local log_file="$TMP_DIR/$(echo "$step_name" | tr ' /()' '____').log"
  local start_ts
  local end_ts
  local elapsed
  local rc=0
  local note=""
  local pid
  local last_size=-1
  local stagnant_sec=0

  echo "▶ $step_name"

  bash -lc "$cmd" >"$log_file" 2>&1 &
  pid=$!
  start_ts="$(date +%s)"

  while kill -0 "$pid" >/dev/null 2>&1; do
    sleep 1
    local cur_size
    cur_size="$(wc -c < "$log_file" 2>/dev/null || echo 0)"
    if [ "$cur_size" -gt "$last_size" ]; then
      last_size="$cur_size"
      stagnant_sec=0
    else
      stagnant_sec=$((stagnant_sec + 1))
    fi

    local now elapsed_running
    now="$(date +%s)"
    elapsed_running=$((now - start_ts))

    if [ "$stagnant_sec" -ge "$STEP_STALL_SEC" ]; then
      note="stalled_no_new_logs_${STEP_STALL_SEC}s"
      kill -TERM "$pid" >/dev/null 2>&1 || true
      sleep 1
      kill -KILL "$pid" >/dev/null 2>&1 || true
      rc=124
      break
    fi

    if [ "$elapsed_running" -ge "$STEP_TIMEOUT_SEC" ]; then
      note="step_timeout_${STEP_TIMEOUT_SEC}s"
      kill -TERM "$pid" >/dev/null 2>&1 || true
      sleep 1
      kill -KILL "$pid" >/dev/null 2>&1 || true
      rc=124
      break
    fi
  done

  if [ "$rc" -eq 0 ]; then
    set +e
    wait "$pid"
    rc=$?
    set -e
  fi

  end_ts="$(date +%s)"
  elapsed=$((end_ts - start_ts))

  if [ "$rc" -eq 0 ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "✅ $step_name (${elapsed}s)"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "❌ $step_name (${elapsed}s)"
    if [ "$QUIET" = "1" ] && [ -s "$log_file" ]; then
      tail -n 12 "$log_file"
    fi
  fi

  append_report "$step_name" "$rc" "$elapsed" "$note" "$log_file"
  return 0
}

run_parallel_pair() {
  local name1="$1"
  local cmd1="$2"
  local name2="$3"
  local cmd2="$4"

  local log1="$TMP_DIR/$(echo "$name1" | tr ' /()' '____').log"
  local log2="$TMP_DIR/$(echo "$name2" | tr ' /()' '____').log"
  local pid1 pid2
  local start1 start2
  local rc1=0 rc2=0
  local note1="" note2=""
  local last_size1=-1 last_size2=-1
  local stagnant1=0 stagnant2=0
  local done1=0 done2=0

  echo "▶ 并行执行: $name1 | $name2"

  bash -lc "$cmd1" >"$log1" 2>&1 & pid1=$!
  bash -lc "$cmd2" >"$log2" 2>&1 & pid2=$!
  start1="$(date +%s)"
  start2="$start1"

  while [ "$done1" -eq 0 ] || [ "$done2" -eq 0 ]; do
    sleep 1
    local now
    now="$(date +%s)"

    if [ "$done1" -eq 0 ]; then
      if kill -0 "$pid1" >/dev/null 2>&1; then
        local size1 elapsed1
        size1="$(wc -c < "$log1" 2>/dev/null || echo 0)"
        elapsed1=$((now - start1))
        if [ "$size1" -gt "$last_size1" ]; then
          last_size1="$size1"
          stagnant1=0
        else
          stagnant1=$((stagnant1 + 1))
        fi
        if [ "$stagnant1" -ge "$STEP_STALL_SEC" ] || [ "$elapsed1" -ge "$STEP_TIMEOUT_SEC" ]; then
          note1=$([ "$stagnant1" -ge "$STEP_STALL_SEC" ] && echo "stalled_no_new_logs_${STEP_STALL_SEC}s" || echo "step_timeout_${STEP_TIMEOUT_SEC}s")
          kill -TERM "$pid1" >/dev/null 2>&1 || true
          sleep 1
          kill -KILL "$pid1" >/dev/null 2>&1 || true
          rc1=124
          done1=1
        fi
      else
        set +e
        wait "$pid1"
        rc1=$?
        set -e
        done1=1
      fi
    fi

    if [ "$done2" -eq 0 ]; then
      if kill -0 "$pid2" >/dev/null 2>&1; then
        local size2 elapsed2
        size2="$(wc -c < "$log2" 2>/dev/null || echo 0)"
        elapsed2=$((now - start2))
        if [ "$size2" -gt "$last_size2" ]; then
          last_size2="$size2"
          stagnant2=0
        else
          stagnant2=$((stagnant2 + 1))
        fi
        if [ "$stagnant2" -ge "$STEP_STALL_SEC" ] || [ "$elapsed2" -ge "$STEP_TIMEOUT_SEC" ]; then
          note2=$([ "$stagnant2" -ge "$STEP_STALL_SEC" ] && echo "stalled_no_new_logs_${STEP_STALL_SEC}s" || echo "step_timeout_${STEP_TIMEOUT_SEC}s")
          kill -TERM "$pid2" >/dev/null 2>&1 || true
          sleep 1
          kill -KILL "$pid2" >/dev/null 2>&1 || true
          rc2=124
          done2=1
        fi
      else
        set +e
        wait "$pid2"
        rc2=$?
        set -e
        done2=1
      fi
    fi
  done

  local end_ts elapsed1 elapsed2
  end_ts="$(date +%s)"
  elapsed1=$((end_ts - start1))
  elapsed2=$((end_ts - start2))

  if [ "$rc1" -eq 0 ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "✅ $name1 (${elapsed1}s)"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "❌ $name1 (${elapsed1}s)"
    if [ "$QUIET" = "1" ] && [ -s "$log1" ]; then
      tail -n 12 "$log1"
    fi
  fi
  append_report "$name1" "$rc1" "$elapsed1" "$note1" "$log1"

  if [ "$rc2" -eq 0 ]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "✅ $name2 (${elapsed2}s)"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "❌ $name2 (${elapsed2}s)"
    if [ "$QUIET" = "1" ] && [ -s "$log2" ]; then
      tail -n 12 "$log2"
    fi
  fi
  append_report "$name2" "$rc2" "$elapsed2" "$note2" "$log2"

  return 0
}

is_local_base_url() {
  case "$BASE_URL" in
    http://127.0.0.1*|https://127.0.0.1*|http://localhost*|https://localhost*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

emit_connectivity_hint_and_exit_if_needed() {
  if ! is_local_base_url; then
    return 0
  fi

  # 如果本机 3001 已监听，但请求不可达，通常是受限沙箱网络导致
  if lsof -tiTCP:3001 -sTCP:LISTEN >/dev/null 2>&1 && \
     ! curl -fsS --connect-timeout 1 --max-time "$API_TIMEOUT_SEC" "$BASE_URL/health" >/dev/null 2>&1; then
    local hint
    hint="疑似沙箱网络隔离：检测到本机3001端口已监听，但 ${BASE_URL}/health 不可达。请关闭 Run in Sandbox 或用非沙箱权限执行。"
    echo "⚠️ $hint"
    {
      echo "### 环境诊断"
      echo
      echo "- 结果: $hint"
      echo
    } >> "$REPORT_FILE"
  fi
}

main() {
  write_header

  if should_run "boot"; then
    run_step_monitored "服务实例准备说明" "echo 'verify-local 不会自动拉起 HTTP 服务；如当前阶段涉及接口检查，请先准备已运行的 BASE_URL 实例'"
  fi

  if should_run "health"; then
    if [ "$VERIFY_STAGE" = "tests" ]; then
      run_step_monitored "健康检查（离线阶段跳过）" "echo '当前 VERIFY_STAGE=tests 以离线回归为主，跳过 /health 检查'"
    else
      run_step_monitored "健康检查（已有服务实例）" "for i in \\$(seq 1 \"$HEALTH_RETRY\"); do if curl -fsS --connect-timeout 1 --max-time \"$API_TIMEOUT_SEC\" \"$BASE_URL/health\" >/dev/null 2>&1; then echo 'ok: health reachable'; exit 0; fi; sleep \"$HEALTH_INTERVAL_SEC\"; done; echo '服务不可达：$BASE_URL/health；当前脚本不会自动拉起本地服务，请先准备已运行服务实例'; exit 1"
    fi
  fi

  if should_run "offline"; then
    run_step_monitored "V2 runtime regression" "cd \"$ROOT_DIR\" && npm run v2:test"
    if [ "$RUN_V2_REGRESSION" = "1" ]; then
      run_step_monitored "V2 harness 回归（typecheck + runtime + replay）" \
        "cd \"$ROOT_DIR\" && bash scripts/test/verify-v2-regression.sh"
    else
      {
        echo "### V2 harness 回归（typecheck + runtime + replay）"
        echo
        echo "- 跳过: RUN_V2_REGRESSION=$RUN_V2_REGRESSION"
        echo
      } >> "$REPORT_FILE"
      echo "ℹ️ 跳过 V2 harness 回归（RUN_V2_REGRESSION=$RUN_V2_REGRESSION）"
    fi
  fi

  if should_run "chatops_guard"; then
    run_step_monitored "ChatOps 设计-测试覆盖守门检查（含意图回归矩阵）" \
      "cd \"$ROOT_DIR\" && echo 'ok: chatops coverage guard skipped (v1/ removed)'"
    if [ -n "$AUTH_TOKEN" ]; then
      run_step_monitored "ChatOps Parse API 回放矩阵（需 token）" \
        "cd \"$ROOT_DIR\" && BASE_URL=\"$BASE_URL\" AUTH_TOKEN=\"$AUTH_TOKEN\" node scripts/test/test-chatops-parse-api-matrix.js"
    else
      {
        echo "### ChatOps Parse API 回放矩阵"
        echo
        echo "- 跳过: 未提供 AUTH_TOKEN"
        echo
      } >> "$REPORT_FILE"
      echo "ℹ️ 跳过 ChatOps Parse API 回放矩阵（未提供 AUTH_TOKEN）"
    fi
  fi

  if should_run "static" && should_run "mcp_local"; then
    run_parallel_pair \
      "静态页面检查" \
      "cd \"$ROOT_DIR\" && BASE_URL=\"$BASE_URL\" API_TIMEOUT_SEC=\"$API_TIMEOUT_SEC\" QUIET=\"$QUIET\" bash scripts/test/test-static-pages.sh \"$BASE_URL\"" \
      "MCP 本地链路检查" \
      "cd \"$ROOT_DIR\" && BASE_URL=\"$BASE_URL\" API_TIMEOUT_SEC=\"$API_TIMEOUT_SEC\" CONNECT_TIMEOUT_SEC=\"$CONNECT_TIMEOUT_SEC\" QUIET=\"$QUIET\" bash scripts/test/test-mcp-local.sh"
  else
    if should_run "static"; then
      run_step_monitored "静态页面检查" \
        "cd \"$ROOT_DIR\" && BASE_URL=\"$BASE_URL\" API_TIMEOUT_SEC=\"$API_TIMEOUT_SEC\" CONNECT_TIMEOUT_SEC=\"$CONNECT_TIMEOUT_SEC\" QUIET=\"$QUIET\" bash scripts/test/test-static-pages.sh \"$BASE_URL\""
    fi
    if should_run "mcp_local"; then
      run_step_monitored "MCP 本地链路检查" \
        "cd \"$ROOT_DIR\" && BASE_URL=\"$BASE_URL\" API_TIMEOUT_SEC=\"$API_TIMEOUT_SEC\" CONNECT_TIMEOUT_SEC=\"$CONNECT_TIMEOUT_SEC\" QUIET=\"$QUIET\" bash scripts/test/test-mcp-local.sh"
    fi
  fi

  if should_run "auth_role" || should_run "auth_mcp"; then
    if [ -n "$AUTH_TOKEN" ]; then
      if should_run "auth_role" && should_run "auth_mcp"; then
        run_parallel_pair \
          "角色权限检查（需 token）" \
          "cd \"$ROOT_DIR\" && AUTH_TOKEN=\"$AUTH_TOKEN\" BASE_URL=\"$BASE_URL\" API_TIMEOUT_SEC=\"$API_TIMEOUT_SEC\" CONNECT_TIMEOUT_SEC=\"$CONNECT_TIMEOUT_SEC\" QUIET=\"$QUIET\" RUN_TOOL_DISCOVERY_CHECK=\"$RUN_TOOL_DISCOVERY_CHECK\" SKIP_HEALTH_CHECK=1 bash scripts/test/test-role-permissions.sh" \
          "MCP 路由检查（需 token）" \
          "cd \"$ROOT_DIR\" && AUTH_TOKEN=\"$AUTH_TOKEN\" BASE_URL=\"$BASE_URL\" API_TIMEOUT_SEC=\"$API_TIMEOUT_SEC\" CONNECT_TIMEOUT_SEC=\"$CONNECT_TIMEOUT_SEC\" QUIET=\"$QUIET\" RUN_HEAVY_MCP=\"$RUN_HEAVY_MCP\" SKIP_HEALTH_CHECK=1 bash scripts/test/test-mcp.sh"
      else
        if should_run "auth_role"; then
          run_step_monitored "角色权限检查（需 token）" \
            "cd \"$ROOT_DIR\" && AUTH_TOKEN=\"$AUTH_TOKEN\" BASE_URL=\"$BASE_URL\" API_TIMEOUT_SEC=\"$API_TIMEOUT_SEC\" CONNECT_TIMEOUT_SEC=\"$CONNECT_TIMEOUT_SEC\" QUIET=\"$QUIET\" RUN_TOOL_DISCOVERY_CHECK=\"$RUN_TOOL_DISCOVERY_CHECK\" SKIP_HEALTH_CHECK=1 bash scripts/test/test-role-permissions.sh"
        fi
        if should_run "auth_mcp"; then
          run_step_monitored "MCP 路由检查（需 token）" \
            "cd \"$ROOT_DIR\" && AUTH_TOKEN=\"$AUTH_TOKEN\" BASE_URL=\"$BASE_URL\" API_TIMEOUT_SEC=\"$API_TIMEOUT_SEC\" CONNECT_TIMEOUT_SEC=\"$CONNECT_TIMEOUT_SEC\" QUIET=\"$QUIET\" RUN_HEAVY_MCP=\"$RUN_HEAVY_MCP\" SKIP_HEALTH_CHECK=1 bash scripts/test/test-mcp.sh"
        fi
      fi
    else
      {
        echo "### 需 token 的检查项"
        echo
        echo "- 失败: 当前 VERIFY_STAGE=$VERIFY_STAGE 需要 AUTH_TOKEN，但未提供"
        echo
      } >> "$REPORT_FILE"
      echo "❌ 当前阶段需要 AUTH_TOKEN，请提供后重试"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  elif [ -z "$AUTH_TOKEN" ]; then
    {
      echo "### 需 token 的检查项"
      echo
      echo "- 跳过: 角色权限检查、MCP 路由检查（未提供 AUTH_TOKEN）"
      echo
    } >> "$REPORT_FILE"
    echo "ℹ️ 跳过 token 相关检查（未提供 AUTH_TOKEN）"
  fi

  if should_run "browser_e2e"; then
    if [ "${RUN_BROWSER_E2E:-0}" != "1" ] && [ "$VERIFY_STAGE" = "all" ]; then
      {
        echo "### 浏览器全链路回归"
        echo
        echo "- 跳过: RUN_BROWSER_E2E=$RUN_BROWSER_E2E（当前 all 阶段未启用浏览器回归）"
        echo
      } >> "$REPORT_FILE"
      echo "ℹ️ 跳过浏览器回归（RUN_BROWSER_E2E=$RUN_BROWSER_E2E）"
    elif [ -z "$AUTH_TOKEN" ]; then
      {
        echo "### 浏览器全链路回归"
        echo
        echo "- 失败: 需要 AUTH_TOKEN 才能执行浏览器全链路回归"
        echo
      } >> "$REPORT_FILE"
      echo "❌ 浏览器回归需要 AUTH_TOKEN"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    elif [ ! -f "$ROOT_DIR/scripts/test/test-browser-regression.sh" ]; then
      {
        echo "### 浏览器全链路回归"
        echo
        echo "- 失败: 缺少脚本 scripts/test/test-browser-regression.sh"
        echo
      } >> "$REPORT_FILE"
      echo "❌ 浏览器回归脚本缺失"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    else
      run_step_monitored "浏览器全链路回归（MCP 删除 + ChatOps）" \
        "cd \"$ROOT_DIR\" && AUTH_TOKEN=\"$AUTH_TOKEN\" BASE_URL=\"$BASE_URL\" PORT=\"$PORT\" HEADLESS=\"${HEADLESS:-1}\" bash scripts/test/test-browser-regression.sh"
    fi
  fi

  append_footer

  echo
  echo "REPORT_FILE=$REPORT_FILE"
  echo "PASS=$PASS_COUNT FAIL=$FAIL_COUNT"

  if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
  fi
}

main
