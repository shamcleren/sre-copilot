#!/bin/bash
# 角色权限系统验收测试脚本

set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
AUTH_TOKEN="${AUTH_TOKEN:-${ADMIN_BOOTSTRAP_TOKEN:-}}"
API_TIMEOUT_SEC="${API_TIMEOUT_SEC:-3}"
CONNECT_TIMEOUT_SEC="${CONNECT_TIMEOUT_SEC:-1}"
SKIP_HEALTH_CHECK="${SKIP_HEALTH_CHECK:-0}"
QUIET="${QUIET:-1}"
TEST_SUFFIX="${TEST_SUFFIX:-$(date +%s)}"
TEST_ROLE_ID="${TEST_ROLE_ID:-test_role_${TEST_SUFFIX}}"
TEST_USER_ID="${TEST_USER_ID:-test_user_${TEST_SUFFIX}}"
RUN_TOOL_DISCOVERY_CHECK="${RUN_TOOL_DISCOVERY_CHECK:-0}"

[ "$QUIET" = "1" ] || {
    echo "🧪 开始验收测试：角色权限系统"
    echo "📡 测试服务器：$BASE_URL"
    echo "⏱️ 请求超时：${API_TIMEOUT_SEC}s"
    echo ""
}

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${RED}[ERROR]${NC} 缺少 AUTH_TOKEN（或 ADMIN_BOOTSTRAP_TOKEN），无法调用 /api/admin/* 接口"
    echo "示例：AUTH_TOKEN=<token> bash scripts/test/test-role-permissions.sh $BASE_URL"
    exit 2
fi

# 测试计数
PASSED=0
FAILED=0

# 测试函数
test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="${5:-200}"
    local response
    local status_code
    local body
    local curl_rc
    
    echo -n "  [role] $name ... "
    
    if [ "$method" = "GET" ]; then
        set +e
        response=$(curl -sS --connect-timeout "$CONNECT_TIMEOUT_SEC" --max-time "$API_TIMEOUT_SEC" -w "\n%{http_code}" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $AUTH_TOKEN" 2>&1)
        curl_rc=$?
        set -e
    else
        if [ -n "$data" ]; then
            set +e
            response=$(curl -sS --connect-timeout "$CONNECT_TIMEOUT_SEC" --max-time "$API_TIMEOUT_SEC" -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $AUTH_TOKEN" \
                -d "$data" 2>&1)
            curl_rc=$?
            set -e
        else
            set +e
            response=$(curl -sS --connect-timeout "$CONNECT_TIMEOUT_SEC" --max-time "$API_TIMEOUT_SEC" -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
                -H "Authorization: Bearer $AUTH_TOKEN" 2>&1)
            curl_rc=$?
            set -e
        fi
    fi
    
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$curl_rc" -ne 0 ]; then
        echo -e "${RED}❌ 失败${NC} (curl rc=$curl_rc)"
        [ "$QUIET" = "1" ] || echo "     输出: $body"
        FAILED=$((FAILED + 1))
        return 1
    elif [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ 通过${NC} (HTTP $status_code)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}❌ 失败${NC} (期望 $expected_status, 实际 $status_code)"
        [ "$QUIET" = "1" ] || echo "     响应: $body"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

[ "$QUIET" = "1" ] || {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "1️⃣  基础健康检查"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
if [ "$SKIP_HEALTH_CHECK" != "1" ]; then
    test_api "服务健康检查" "GET" "/health" "" "200" || true
fi
[ "$QUIET" = "1" ] || echo ""

[ "$QUIET" = "1" ] || {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "2️⃣  角色管理 API"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
test_api "获取所有角色" "GET" "/api/admin/roles" "" "200" || true
test_api "创建测试角色" "POST" "/api/admin/roles" \
    "{\"id\":\"$TEST_ROLE_ID\",\"name\":\"测试角色\",\"type\":\"test\",\"config\":{}}" "200" || true
[ "$QUIET" = "1" ] || echo ""

[ "$QUIET" = "1" ] || {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "3️⃣  工具管理 API"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
if [ "$RUN_TOOL_DISCOVERY_CHECK" = "1" ]; then
    test_api "获取所有工具" "GET" "/api/admin/tools" "" "200" || true
else
    echo "  [role] 获取所有工具 ... ${YELLOW}⏭ 跳过(discovery)${NC}"
fi
test_api "为角色分配工具" "POST" "/api/admin/roles/$TEST_ROLE_ID/tools" \
    '{"toolName":"get_current_time","config":{}}' "200" || true
test_api "获取角色工具列表" "GET" "/api/admin/roles/$TEST_ROLE_ID/tools" "" "200" || true
[ "$QUIET" = "1" ] || echo ""

[ "$QUIET" = "1" ] || {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "4️⃣  用户-角色关系 API"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
test_api "为用户分配角色" "POST" "/api/admin/users/$TEST_USER_ID/roles" \
    "{\"roleId\":\"$TEST_ROLE_ID\"}" "200" || true
test_api "获取用户角色" "GET" "/api/admin/users/$TEST_USER_ID/roles" "" "200" || true
[ "$QUIET" = "1" ] || echo ""

[ "$QUIET" = "1" ] || {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "5️⃣  清理测试数据"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
test_api "移除用户角色" "DELETE" "/api/admin/users/$TEST_USER_ID/roles/$TEST_ROLE_ID" "" "200" || true
test_api "移除角色工具" "DELETE" "/api/admin/roles/$TEST_ROLE_ID/tools/get_current_time" "" "200" || true
[ "$QUIET" = "1" ] || echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 测试结果汇总"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASSED + FAILED))
echo -e "  总计: $TOTAL 个测试"
echo -e "  ${GREEN}通过: $PASSED${NC}"
echo -e "  ${RED}失败: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！角色权限系统运行正常。${NC}"
    exit 0
else
    echo -e "${RED}⚠️  部分测试失败，请检查服务状态和数据库连接。${NC}"
    exit 1
fi
