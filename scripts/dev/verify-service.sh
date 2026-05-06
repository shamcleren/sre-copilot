#!/bin/bash
# 部署后服务验证（仅 HTTP 检查，可在本机执行，无需 kubectl）
# 使用方式: ./scripts/dev/verify-service.sh [BASE_URL]
# 示例: ./scripts/dev/verify-service.sh
#       ./scripts/dev/verify-service.sh https://sre-copilot.example.com

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 加载配置获取 Ingress 域名
if [ -f "$SCRIPT_DIR/config.local.sh" ]; then
    source "$SCRIPT_DIR/config.local.sh"
fi
INGRESS_HOST="${INGRESS_HOST:-sre-copilot.example.com}"
BASE_URL="${1:-https://${INGRESS_HOST}}"
# 若传入的 BASE_URL 已带协议则直接用，否则加 https
[[ "$BASE_URL" =~ ^https?:// ]] || BASE_URL="https://${BASE_URL}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=============================================="
echo "🔍 服务可用性验证"
echo "=============================================="
echo "BASE_URL: $BASE_URL"
echo ""

pass=0
fail=0

check() {
    local name="$1"
    local url="$2"
    local method="${3:-GET}"
    local accept_codes="${4:-200}"  # 可选：接受的多码，如 "200 302"
    echo -n "  $name ... "
    if [ "$method" = "GET" ]; then
        code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "$url")
    else
        code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" --connect-timeout 10 "$url")
    fi
    if echo " $accept_codes " | grep -q " $code "; then
        echo -e "${GREEN}✓ HTTP $code${NC}"
        pass=$((pass + 1))
        return 0
    else
        echo -e "${RED}✗ HTTP $code${NC}"
        fail=$((fail + 1))
        return 1
    fi
}

echo "1. 根路径"
check "GET /" "${BASE_URL}/" "GET" "200 302"
echo ""

echo "2. 企微健康检查"
check "GET /wechat/health" "${BASE_URL}/wechat/health" "GET" "200 302"
echo ""

echo "3. MCP 子路径（前缀可达即可）"
check "GET /mcp/" "${BASE_URL}/mcp/" "GET" "200 302 404 405"
echo ""

echo "=============================================="
echo "结果: 通过 $pass / 失败 $fail"
echo "=============================================="
if [ $fail -eq 0 ]; then
    echo -e "${GREEN}✓ 服务可用${NC}"
    exit 0
else
    echo -e "${RED}✗ 部分检查未通过，请确认已部署且 Ingress 可访问${NC}"
    exit 1
fi
