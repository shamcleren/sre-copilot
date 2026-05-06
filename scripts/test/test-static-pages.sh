#!/bin/bash

# SRE Copilot 静态页面访问测试脚本
# 用于验证所有静态页面路由是否正常工作
set -euo pipefail

# 服务器地址
SERVER="${1:-http://localhost:3001}"
API_TIMEOUT_SEC="${API_TIMEOUT_SEC:-3}"
CONNECT_TIMEOUT_SEC="${CONNECT_TIMEOUT_SEC:-1}"
SKIP_HEALTH_CHECK="${SKIP_HEALTH_CHECK:-1}"
QUIET="${QUIET:-1}"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_url() {
    local url=$1
    local name=$2
    local response
    
    echo -n "[static] $name ... "
    
    response=$(curl -sS --connect-timeout "$CONNECT_TIMEOUT_SEC" --max-time "$API_TIMEOUT_SEC" -o /dev/null -w "%{http_code}" "$url" || echo "000")
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ 成功${NC} (HTTP $response)"
        return 0
    else
        echo -e "${RED}✗ 失败${NC} (HTTP $response)"
        return 1
    fi
}

[ "$QUIET" = "1" ] || {
    echo "🚀 SRE Copilot 静态页面访问测试"
    echo "======================================"
    echo ""
}

# 可选：检查服务是否运行（默认禁用，不依赖 /health）
if [ "$SKIP_HEALTH_CHECK" = "1" ]; then
    [ "$QUIET" = "1" ] || echo "ℹ️ 健康检查已禁用，直接测试静态页面"
else
    [ "$QUIET" = "1" ] || echo "📡 检查服务状态..."
    if ! curl -sS --connect-timeout "$CONNECT_TIMEOUT_SEC" --max-time "$API_TIMEOUT_SEC" "$SERVER/health" > /dev/null 2>&1; then
        echo -e "${RED}✗ 服务未运行！${NC}"
        [ "$QUIET" = "1" ] || {
            echo ""
            echo "请先准备一个已运行的服务实例，并通过 BASE_URL/脚本参数指向它"
        }
        exit 1
    fi
    [ "$QUIET" = "1" ] || {
        echo -e "${GREEN}✓ 服务正在运行${NC}"
        echo ""
    }
fi

# 测试所有页面
[ "$QUIET" = "1" ] || {
    echo "🧪 测试静态页面路由..."
    echo "--------------------------------------"
}

success_count=0
fail_count=0

# 测试文档中心首页
if test_url "$SERVER/" "文档中心首页 (/)"; then
    success_count=$((success_count + 1))
else
    fail_count=$((fail_count + 1))
fi

# 测试架构图页面
if test_url "$SERVER/architecture" "系统架构图 (/architecture)"; then
    success_count=$((success_count + 1))
else
    fail_count=$((fail_count + 1))
fi

# 测试三层记忆页面
if test_url "$SERVER/memory" "三层记忆系统 (/memory)"; then
    success_count=$((success_count + 1))
else
    fail_count=$((fail_count + 1))
fi

# 测试管理控制台
if test_url "$SERVER/admin" "管理控制台 (/admin)"; then
    success_count=$((success_count + 1))
else
    fail_count=$((fail_count + 1))
fi

[ "$QUIET" = "1" ] || {
    echo ""
    echo "🧪 测试静态文件直接访问..."
    echo "--------------------------------------"
}

# 测试静态文件直接访问
if test_url "$SERVER/static/index.html" "index.html (静态)"; then
    success_count=$((success_count + 1))
else
    fail_count=$((fail_count + 1))
fi

if test_url "$SERVER/static/admin.html" "admin.html (静态)"; then
    success_count=$((success_count + 1))
else
    fail_count=$((fail_count + 1))
fi

# 测试结果汇总
[ "$QUIET" = "1" ] || {
    echo ""
    echo "======================================"
    echo "📊 测试结果汇总"
    echo "======================================"
}
echo -e "成功: ${GREEN}$success_count${NC}"
echo -e "失败: ${RED}$fail_count${NC}"
echo "总计: $((success_count + fail_count))"
[ "$QUIET" = "1" ] || echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！${NC}"
    [ "$QUIET" = "1" ] || {
        echo ""
        echo "📝 访问地址："
        echo "  文档中心: $SERVER/"
        echo "  管理控制台: $SERVER/admin"
    }
    exit 0
else
    echo -e "${RED}❌ 部分测试失败，请检查配置${NC}"
    exit 1
fi
