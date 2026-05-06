#!/usr/bin/env bash
# SSH 远程管理工具包装器（供 nodejs script executor 调用）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SSH_MANAGER_DEFAULT="$ROOT_DIR/../../../../public/tools/scripts/ssh-manager.sh"
SSH_MANAGER_SCRIPT="${SSH_MANAGER_SCRIPT:-$SSH_MANAGER_DEFAULT}"

if [ ! -f "$SSH_MANAGER_SCRIPT" ]; then
  echo "{\"success\":false,\"error\":\"ssh-manager.sh 不存在: $SSH_MANAGER_SCRIPT\"}"
  exit 0
fi

if [ ! -x "$SSH_MANAGER_SCRIPT" ]; then
  chmod +x "$SSH_MANAGER_SCRIPT" 2>/dev/null || true
fi

json_get() {
  local key="$1"
  TOOL_KEY="$key" node -e '
    const key = process.env.TOOL_KEY;
    const raw = process.env.TOOL_PARAMS || "{}";
    let p = {};
    try { p = JSON.parse(raw); } catch { p = {}; }
    const v = p[key];
    if (v === undefined || v === null) process.exit(2);
    if (typeof v === "object") process.stdout.write(JSON.stringify(v));
    else process.stdout.write(String(v));
  ' 2>/dev/null || true
}

json_bool() {
  local key="$1"
  local value
  value="$(json_get "$key" || true)"
  case "$value" in
    true|TRUE|1|yes|YES|on|ON) echo "true" ;;
    *) echo "false" ;;
  esac
}

ACTION="$(json_get action)"
HOST="$(json_get host)"
CMD_TEXT="$(json_get command)"
LOCAL_PATH="$(json_get localPath)"
REMOTE_PATH="$(json_get remotePath)"
CONFIRM_EXECUTE="$(json_bool confirmExecute)"
MODE="$(json_get mode)"

if [ -z "$ACTION" ]; then
  echo "{\"success\":false,\"error\":\"缺少 action 参数\"}"
  exit 0
fi

case "$ACTION" in
  list|show|test|connect|exec|upload|download|init|add) ;;
  *)
    echo "{\"success\":false,\"error\":\"不支持的 action: $ACTION\"}"
    exit 0
    ;;
esac

# 非只读动作默认 advice-only，必须显式确认才执行
if [ "$ACTION" = "exec" ] || [ "$ACTION" = "upload" ] || [ "$ACTION" = "download" ] || [ "$ACTION" = "add" ] || [ "$ACTION" = "init" ] || [ "$ACTION" = "connect" ]; then
  if [ "$MODE" != "execute" ] || [ "$CONFIRM_EXECUTE" != "true" ]; then
    echo "{\"success\":true,\"mode\":\"advice-only\",\"message\":\"高风险操作默认仅返回指令，请设置 mode=execute 且 confirmExecute=true 执行\",\"suggested\":\"$SSH_MANAGER_SCRIPT $ACTION ${HOST:-}\"}"
    exit 0
  fi
fi

if [ "$ACTION" = "exec" ] && [ "${ALLOW_SSH_REMOTE_EXEC:-false}" != "true" ]; then
  echo "{\"success\":true,\"mode\":\"advice-only\",\"message\":\"未开启远程执行开关，返回建议命令\",\"suggested\":\"$SSH_MANAGER_SCRIPT exec ${HOST:-} ${CMD_TEXT:-}\"}"
  exit 0
fi

run_and_capture() {
  local status=0
  local out
  if ! out="$("$@" 2>&1)"; then
    status=$?
  fi
  TOOL_STATUS="$status" TOOL_OUT="$out" node -e '
    const status = Number(process.env.TOOL_STATUS || "1");
    const out = String(process.env.TOOL_OUT || "");
    process.stdout.write(JSON.stringify({
      success: status === 0,
      exitCode: status,
      output: out
    }));
  '
}

case "$ACTION" in
  list)
    run_and_capture "$SSH_MANAGER_SCRIPT" list
    ;;
  show|test|connect)
    if [ -z "$HOST" ]; then
      echo "{\"success\":false,\"error\":\"action=$ACTION 需要 host\"}"
      exit 0
    fi
    run_and_capture "$SSH_MANAGER_SCRIPT" "$ACTION" "$HOST"
    ;;
  exec)
    if [ -z "$HOST" ] || [ -z "$CMD_TEXT" ]; then
      echo "{\"success\":false,\"error\":\"action=exec 需要 host 和 command\"}"
      exit 0
    fi
    run_and_capture "$SSH_MANAGER_SCRIPT" exec "$HOST" "$CMD_TEXT"
    ;;
  upload|download)
    if [ -z "$HOST" ] || [ -z "$LOCAL_PATH" ] || [ -z "$REMOTE_PATH" ]; then
      echo "{\"success\":false,\"error\":\"action=$ACTION 需要 host/localPath/remotePath\"}"
      exit 0
    fi
    run_and_capture "$SSH_MANAGER_SCRIPT" "$ACTION" "$HOST" "$LOCAL_PATH" "$REMOTE_PATH"
    ;;
  init|add)
    run_and_capture "$SSH_MANAGER_SCRIPT" "$ACTION"
    ;;
esac
