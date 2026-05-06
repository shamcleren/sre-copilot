#!/usr/bin/env bash
# Codex 远程运维包装器：用于开发后自动部署、验活、状态回传

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-dev}"
REMOTE_PATH="${REMOTE_PATH:-/data/sre-copilot}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"

usage() {
  cat <<'EOF'
用法:
  scripts/tools/CODEX-REMOTE-OPS.SH <action> [args]

动作:
  deploy-local        远程拉代码并执行 legacy make local-restart-bg（仅维护既有 dev 实例）
  status              返回远程服务健康状态与关键进程/端口
  health              仅返回 /health
  test-no-llm         远程执行 make test-no-llm
  test-report         远程执行 make test-all-report（自动兜底 AUTH_TOKEN）
  test-report-push    远程执行 test-report 后提交并推送报告
  exec "<cmd>"        在远程项目目录执行任意命令

环境变量:
  REMOTE_HOST         远程主机（默认 dev）
  REMOTE_PATH         远程项目路径（默认 /data/sre-copilot）
  BASE_URL            健康检查地址（默认 http://127.0.0.1:3001）
  AUTH_TOKEN          可选；为空时回退到远程 .env.secrets 的 ADMIN_BOOTSTRAP_TOKEN
  REPORT_COMMIT_MSG   test-report-push 的提交信息（可选）
EOF
}

run_remote() {
  local cmd="$1"
  ssh "${REMOTE_HOST}" "cd ${REMOTE_PATH} && ${cmd}"
}

resolve_auth_token() {
  if [ -n "${AUTH_TOKEN:-}" ]; then
    printf '%s' "${AUTH_TOKEN}"
    return 0
  fi
  run_remote "if [ -f .env.secrets ]; then sed -n 's/^ADMIN_BOOTSTRAP_TOKEN=//p' .env.secrets | head -n1; fi" | tr -d '\r'
}

action="${1:-}"
case "${action}" in
  deploy-local)
    run_remote "git pull --ff-only && make local-restart-bg && for i in \$(seq 1 30); do if curl -fsS ${BASE_URL}/health >/dev/null 2>&1; then curl -sS ${BASE_URL}/health; exit 0; fi; sleep 1; done; echo '❌ health check timeout after restart'; exit 1"
    ;;
  status)
    run_remote "echo '[health]'; curl -sS ${BASE_URL}/health; echo; echo '[process]'; pgrep -af 'sre-copilot' || true; echo '[listen]'; ss -lntp | grep ':3001' || true"
    ;;
  health)
    run_remote "curl -sS ${BASE_URL}/health"
    ;;
  test-no-llm)
    run_remote "make test-no-llm"
    ;;
  test-report)
    TOKEN="$(resolve_auth_token)"
    if [ -z "${TOKEN}" ]; then
      echo "❌ 无法获取 token。请设置 AUTH_TOKEN，或在远程 .env.secrets 配置 ADMIN_BOOTSTRAP_TOKEN"
      exit 1
    fi
    TOKEN_Q="$(printf '%q' "${TOKEN}")"
    BASE_URL_Q="$(printf '%q' "${BASE_URL}")"
    run_remote "AUTH_TOKEN=${TOKEN_Q} BASE_URL=${BASE_URL_Q} make test-all-report"
    ;;
  test-report-push)
    TOKEN="$(resolve_auth_token)"
    if [ -z "${TOKEN}" ]; then
      echo "❌ 无法获取 token。请设置 AUTH_TOKEN，或在远程 .env.secrets 配置 ADMIN_BOOTSTRAP_TOKEN"
      exit 1
    fi
    TOKEN_Q="$(printf '%q' "${TOKEN}")"
    BASE_URL_Q="$(printf '%q' "${BASE_URL}")"
    MSG="${REPORT_COMMIT_MSG:-test: add full test run report}"
    MSG_Q="$(printf '%q' "${MSG}")"
    run_remote "set -e; AUTH_TOKEN=${TOKEN_Q} BASE_URL=${BASE_URL_Q} make test-all-report; REPORT_FILE=\$(ls -1t docs/verification/FULL-TEST-RUN-*.MD 2>/dev/null | head -n1); if [ -z \"\$REPORT_FILE\" ]; then echo '❌ 未找到报告文件'; exit 1; fi; git add \"\$REPORT_FILE\"; if git diff --cached --quiet; then echo 'ℹ️ 报告无变化，跳过 commit'; else git commit -m ${MSG_Q}; git push; echo \"✅ 已推送报告: \$REPORT_FILE\"; fi"
    ;;
  exec)
    shift
    if [ "$#" -eq 0 ]; then
      echo "❌ exec 需要命令参数"
      exit 1
    fi
    run_remote "$*"
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "❌ 不支持的 action: ${action}"
    usage
    exit 1
    ;;
esac
