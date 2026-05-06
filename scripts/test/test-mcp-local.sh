#!/bin/bash
# 完整测试脚本 - Node.js版本
set -euo pipefail

AUTH_TOKEN="${AUTH_TOKEN:-${ADMIN_BOOTSTRAP_TOKEN:-}}"
BASE_URL="${1:-http://localhost:3001}"
API_TIMEOUT_SEC="${API_TIMEOUT_SEC:-3}"
CONNECT_TIMEOUT_SEC="${CONNECT_TIMEOUT_SEC:-1}"
QUIET="${QUIET:-1}"
RUN_TOOLS_ENDPOINT_CHECK="${RUN_TOOLS_ENDPOINT_CHECK:-1}"
CURL_FLAGS=(--connect-timeout "$CONNECT_TIMEOUT_SEC" --max-time "$API_TIMEOUT_SEC")
CURL_RETRIES="${CURL_RETRIES:-2}"

curl_with_retry() {
    local attempt=1
    local max_attempts="$CURL_RETRIES"
    local rc=0
    while [ "$attempt" -le "$max_attempts" ]; do
        if curl -sS "${CURL_FLAGS[@]}" "$@"; then
            return 0
        fi
        rc=$?
        if [ "$attempt" -ge "$max_attempts" ]; then
            break
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    return "$rc"
}

# 检查jq是否安装，如果没有则使用cat
if command -v jq &> /dev/null; then
    JSON_TOOL="jq ."
else
    JSON_TOOL="cat"
    echo "⚠️  建议安装 jq 以获得更好的JSON格式化: brew install jq"
    echo ""
fi

[ "$QUIET" = "1" ] || {
  echo "=========================================="
  echo "SRE Copilot MCP 服务测试 (Node.js)"
  echo "=========================================="
  echo ""
}

# 1. 健康检查
[ "$QUIET" = "1" ] || echo "1. 测试健康检查..."
curl_with_retry "$BASE_URL/health" | $JSON_TOOL
[ "$QUIET" = "1" ] || echo ""

# 2. 企微回调验证
[ "$QUIET" = "1" ] || echo "2. 测试企微回调验证..."
curl_with_retry "$BASE_URL/wechat/callback?msg_signature=test&timestamp=1234567890&nonce=test&echostr=hello"
[ "$QUIET" = "1" ] || {
  echo ""
  echo ""
}

# 3. MCP服务状态 (如果有)
[ "$QUIET" = "1" ] || echo "3. 测试 MCP 服务器列表..."
if [ -z "$AUTH_TOKEN" ]; then
    echo "⚠️ 未提供 AUTH_TOKEN，跳过 /api/mcp/servers 与 /api/tools"
else
    curl_with_retry "$BASE_URL/api/mcp/servers" \
      -H "Authorization: Bearer $AUTH_TOKEN" | $JSON_TOOL
fi
[ "$QUIET" = "1" ] || echo ""

# 4. 工具列表
if [ -n "$AUTH_TOKEN" ] && [ "$RUN_TOOLS_ENDPOINT_CHECK" = "1" ]; then
    [ "$QUIET" = "1" ] || echo "4. 测试工具列表..."
    curl_with_retry "$BASE_URL/api/tools" \
      -H "Authorization: Bearer $AUTH_TOKEN" | $JSON_TOOL
    [ "$QUIET" = "1" ] || echo ""
elif [ -n "$AUTH_TOKEN" ]; then
    echo "⏭ 跳过 /api/tools 检查 (RUN_TOOLS_ENDPOINT_CHECK=$RUN_TOOLS_ENDPOINT_CHECK)"
fi

# 5. 服务健康状态
[ "$QUIET" = "1" ] || echo "5. 检查服务进程..."
if pgrep -f "node.*main" > /dev/null; then
    echo "✅ Node.js 服务正在运行"
else
    echo "❌ Node.js 服务未运行"
fi

# 6. 端口监听检查
[ "$QUIET" = "1" ] || {
  echo ""
  echo "6. 检查端口监听..."
}
if netstat -an 2>/dev/null | grep -q ":3001.*LISTEN" || lsof -i :3001 2>/dev/null | grep -q LISTEN; then
    echo "✅ 端口 3001 正在监听"
else
    echo "❌ 端口 3001 未监听"
fi

[ "$QUIET" = "1" ] || {
  echo ""
  echo "=========================================="
  echo "测试完成！"
  echo "=========================================="
}
