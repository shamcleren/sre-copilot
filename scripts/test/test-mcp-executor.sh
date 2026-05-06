#!/bin/bash
# MCP 执行器测试脚本

set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
AUTH_TOKEN="${AUTH_TOKEN:-${ADMIN_BOOTSTRAP_TOKEN:-}}"
echo "🧪 测试 MCP 执行器"
echo "📡 服务器：$BASE_URL"
echo ""

if [ -z "$AUTH_TOKEN" ]; then
  echo "[ERROR] 缺少 AUTH_TOKEN（或 ADMIN_BOOTSTRAP_TOKEN），无法调用 /api/mcp/* 与 /api/tools"
  echo "示例：AUTH_TOKEN=<token> bash scripts/test/test-mcp-executor.sh $BASE_URL"
  exit 2
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if command -v jq >/dev/null 2>&1; then
  JSON_TOOL="jq ."
else
  JSON_TOOL="cat"
  echo "⚠️  未安装 jq，使用原始 JSON 输出"
fi

FAILURES=0

run_check() {
  local name="$1"
  local url="$2"
  echo "📋 $name"
  local resp
  resp=$(curl -s -w "\n%{http_code}" "$url" -H "Authorization: Bearer $AUTH_TOKEN")
  local status_code
  status_code=$(echo "$resp" | tail -n1)
  local body
  body=$(echo "$resp" | sed '$d')
  echo "$body" | $JSON_TOOL
  if [ "$status_code" != "200" ] || ! echo "$body" | grep -q '"success":true'; then
    echo -e "${RED}[FAIL]${NC} $name 失败（HTTP $status_code 或 success!=true）"
    FAILURES=$((FAILURES + 1))
  else
    echo -e "${GREEN}[PASS]${NC} $name"
  fi
  echo ""
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  MCP 服务器管理"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_check "获取 MCP 服务器列表" "$BASE_URL/api/mcp/servers"
run_check "测试 MCP 服务器连接(sre-copilot)" "$BASE_URL/api/mcp/servers/sre-copilot/test"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  MCP 工具查询"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_check "获取 MCP 服务器工具列表(sre-copilot)" "$BASE_URL/api/mcp/servers/sre-copilot/tools"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  查看已注册的 MCP 工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_check "获取工具列表（/api/tools）" "$BASE_URL/api/tools"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  测试 MCP 工具调用（可选）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "⚠️  提示：需要 MCP 服务器实际运行才能测试"
echo "💡 如需测试调用，取消下面的注释："
echo ""
echo "# curl -X POST \"$BASE_URL/api/mcp/servers/sre-copilot/tools/search/call\" \\"
echo "#   -H \"Authorization: Bearer $AUTH_TOKEN\" \\"
echo "#   -H \"Content-Type: application/json\" \\"
echo "#   -d '{\"params\": {\"query\": \"test\"}}' | jq '.'"
echo ""

if [ "$FAILURES" -gt 0 ]; then
  echo -e "${RED}❌ MCP 执行器测试失败：$FAILURES 项未通过${NC}"
  exit 1
fi

echo -e "${GREEN}✅ MCP 执行器测试完成（全部通过）${NC}"
