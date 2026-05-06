#!/usr/bin/env bash
# MCP 服务快速测试脚本
set -euo pipefail

# 配置
BASE_URL="${1:-http://localhost:3001}"
API_KEY="${MCP_API_KEY:-your-api-key-here}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
API_TIMEOUT_SEC="${API_TIMEOUT_SEC:-3}"
CONNECT_TIMEOUT_SEC="${CONNECT_TIMEOUT_SEC:-1}"
SKIP_HEALTH_CHECK="${SKIP_HEALTH_CHECK:-0}"
QUIET="${QUIET:-1}"
RUN_HEAVY_MCP="${RUN_HEAVY_MCP:-0}"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_passed=0
test_failed=0

[ "$QUIET" = "1" ] || {
    echo "=========================================="
    echo "SRE Copilot MCP 服务测试"
    echo "=========================================="
    echo ""
}

# 测试函数
run_test() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=${4:-}
    local response
    local http_code
    local body
    local curl_rc
    
    echo -n "[mcp] $name ... "
    
    local auth_headers=()
    if [ -n "$AUTH_TOKEN" ]; then
      auth_headers+=(-H "Authorization: Bearer $AUTH_TOKEN")
    fi
    if [ "$API_KEY" != "your-api-key-here" ] && [ -n "$API_KEY" ]; then
      auth_headers+=(-H "X-API-Key: $API_KEY")
    fi

    if [ "$method" = "GET" ]; then
        set +e
        response=$(curl -sS --connect-timeout "$CONNECT_TIMEOUT_SEC" --max-time "$API_TIMEOUT_SEC" -w "\n%{http_code}" "$url" "${auth_headers[@]}" 2>&1)
        curl_rc=$?
        set -e
    else
        set +e
        response=$(curl -sS --connect-timeout "$CONNECT_TIMEOUT_SEC" --max-time "$API_TIMEOUT_SEC" -w "\n%{http_code}" -X POST "$url" \
            "${auth_headers[@]}" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
        curl_rc=$?
        set -e
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$curl_rc" -ne 0 ]; then
        echo -e "${RED}✗ 失败${NC} (curl rc=$curl_rc)"
        [ "$QUIET" = "1" ] || echo "  错误: $(echo "$body" | head -c 200)"
        test_failed=$((test_failed + 1))
    elif [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ 通过${NC}"
        test_passed=$((test_passed + 1))
        if [ "$QUIET" != "1" ] && [ -n "$body" ]; then
            if command -v jq >/dev/null 2>&1; then
              echo "  响应: $(echo "$body" | jq -r '.' 2>/dev/null || echo "$body" | head -c 100)"
            else
              echo "  响应: $(echo "$body" | head -c 100)"
            fi
        fi
    else
        echo -e "${RED}✗ 失败 (HTTP $http_code)${NC}"
        test_failed=$((test_failed + 1))
        if [ -n "$body" ]; then
            echo "  错误: $(echo $body | head -c 200)"
        fi
    fi
    [ "$QUIET" = "1" ] || echo ""
}

# 1. 健康检查
if [ "$SKIP_HEALTH_CHECK" != "1" ]; then
    run_test "健康检查" "$BASE_URL/health" "GET"
fi

# 2. 根路径
run_test "根路径" "$BASE_URL/" "GET"

if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  未提供 AUTH_TOKEN，跳过 MCP JSON-RPC 测试（/mcp/request 需要鉴权）${NC}"
else
    # 3. MCP initialize
    run_test "MCP initialize" "$BASE_URL/mcp/request" "POST" \
        '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'

    # 4. 列出工具
    run_test "列出工具(tools/list)" "$BASE_URL/mcp/request" "POST" \
        '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'

    # 5. 工具调用属于重路径（可能触发推理），默认跳过以提升验收速度
    if [ "$RUN_HEAVY_MCP" = "1" ]; then
        run_test "工具调用(tools/call:query)" "$BASE_URL/mcp/request" "POST" \
            '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"query","arguments":{"question":"你好，请一句话介绍你自己"}},"id":3}'
    else
        echo "[mcp] 工具调用(tools/call:query) ... ${YELLOW}⏭ 跳过(heavy)${NC}"
    fi

    # 6. 列出资源
    run_test "列出资源(resources/list)" "$BASE_URL/mcp/request" "POST" \
        '{"jsonrpc":"2.0","method":"resources/list","params":{},"id":4}'

    # 7. 列出提示词
    run_test "列出提示词(prompts/list)" "$BASE_URL/mcp/request" "POST" \
        '{"jsonrpc":"2.0","method":"prompts/list","params":{},"id":5}'
fi

# 汇总
[ "$QUIET" = "1" ] || {
    echo "=========================================="
    echo "测试完成"
    echo "=========================================="
}
echo -e "通过: ${GREEN}${test_passed}${NC}"
echo -e "失败: ${RED}${test_failed}${NC}"
echo ""

if [ $test_failed -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 部分测试失败${NC}"
    exit 1
fi
