#!/bin/bash
# 域名健康检查脚本
# 用途：检查域名配置是否正确，Callback 接口是否可访问

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 默认域名
DOMAIN="${1:-sre-copilot.example.com}"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║   🔍 域名健康检查工具                                        ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}检查域名: ${DOMAIN}${NC}"
echo -e "${CYAN}检查时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""

# 统计变量
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# 检查函数
check_item() {
    local name="$1"
    local command="$2"
    local success_msg="$3"
    local fail_msg="$4"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    echo -n "  [$TOTAL_CHECKS] $name ... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $success_msg${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}❌ $fail_msg${NC}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

# 检查函数（带输出）
check_item_with_output() {
    local name="$1"
    local command="$2"
    local success_pattern="$3"
    local success_msg="$4"
    local fail_msg="$5"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    echo -n "  [$TOTAL_CHECKS] $name ... "
    
    output=$(eval "$command" 2>&1)
    if echo "$output" | grep -q "$success_pattern"; then
        echo -e "${GREEN}✅ $success_msg${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}❌ $fail_msg${NC}"
        echo -e "${YELLOW}     输出: $output${NC}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}1. DNS 解析检查${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

check_item "DNS 解析" \
    "nslookup $DOMAIN" \
    "DNS 解析成功" \
    "DNS 解析失败"

if command -v dig > /dev/null 2>&1; then
    DNS_IP=$(dig +short $DOMAIN | head -n 1)
    if [ -n "$DNS_IP" ]; then
        echo -e "     ${CYAN}解析 IP: $DNS_IP${NC}"
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}2. HTTP 基础访问检查${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 健康检查端点
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$DOMAIN/health 2>/dev/null || echo "000")
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] 健康检查端点 (/health) ... "
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ HTTP $HTTP_CODE${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌ HTTP $HTTP_CODE${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# 根路径
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$DOMAIN/ 2>/dev/null || echo "000")
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] 根路径 (/) ... "
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ HTTP $HTTP_CODE${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${YELLOW}⚠️  HTTP $HTTP_CODE${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}3. 企微 Callback 接口检查${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# GET 接口（缺少参数）
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$DOMAIN/wechat/callback 2>/dev/null || echo "000")
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] GET /wechat/callback (无参数) ... "
if [ "$HTTP_CODE" = "400" ]; then
    echo -e "${GREEN}✅ HTTP $HTTP_CODE (正确返回参数错误)${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
elif [ "$HTTP_CODE" = "403" ]; then
    echo -e "${GREEN}✅ HTTP $HTTP_CODE (接口可访问)${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌ HTTP $HTTP_CODE (期望 400 或 403)${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# GET 接口（带参数）
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$DOMAIN/wechat/callback?msg_signature=test&timestamp=1234567890&nonce=test&echostr=hello" 2>/dev/null || echo "000")
RESPONSE=$(curl -s --connect-timeout 5 "http://$DOMAIN/wechat/callback?msg_signature=test&timestamp=1234567890&nonce=test&echostr=hello" 2>/dev/null || echo "")
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] GET /wechat/callback (带参数) ... "
if [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "400" ]; then
    echo -e "${GREEN}✅ HTTP $HTTP_CODE (接口正常响应)${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    if [ -n "$RESPONSE" ]; then
        echo -e "     ${CYAN}响应: ${RESPONSE:0:100}${NC}"
    fi
else
    echo -e "${RED}❌ HTTP $HTTP_CODE (期望 400 或 403)${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# POST 接口（缺少参数）
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 -X POST http://$DOMAIN/wechat/callback 2>/dev/null || echo "000")
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] POST /wechat/callback (无参数) ... "
if [ "$HTTP_CODE" = "400" ]; then
    echo -e "${GREEN}✅ HTTP $HTTP_CODE (正确返回参数错误)${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
elif [ "$HTTP_CODE" = "403" ]; then
    echo -e "${GREEN}✅ HTTP $HTTP_CODE (接口可访问)${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌ HTTP $HTTP_CODE (期望 400 或 403)${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}4. 响应时间检查${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 测试响应时间
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --connect-timeout 5 http://$DOMAIN/health 2>/dev/null || echo "0")
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] 响应时间 (/health) ... "
if [ "$RESPONSE_TIME" != "0" ]; then
    RESPONSE_TIME_MS=$(echo "$RESPONSE_TIME * 1000" | bc)
    if (( $(echo "$RESPONSE_TIME < 1.0" | bc -l) )); then
        echo -e "${GREEN}✅ ${RESPONSE_TIME_MS}ms (快速)${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    elif (( $(echo "$RESPONSE_TIME < 3.0" | bc -l) )); then
        echo -e "${YELLOW}⚠️  ${RESPONSE_TIME_MS}ms (正常)${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo -e "${RED}❌ ${RESPONSE_TIME_MS}ms (慢)${NC}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
else
    echo -e "${RED}❌ 无法测量${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}5. Nginx 配置检查${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 检查 Nginx 是否运行
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] Nginx 服务状态 ... "
if systemctl is-active --quiet nginx 2>/dev/null || pgrep nginx > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 运行中${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌ 未运行${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# 检查 Nginx 配置文件
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] Nginx 配置语法 ... "
if sudo nginx -t > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 配置正确${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌ 配置错误${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# 检查域名配置
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] 域名配置 ($DOMAIN) ... "
if sudo nginx -T 2>/dev/null | grep -q "server_name.*$DOMAIN"; then
    echo -e "${GREEN}✅ 已配置${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌ 未找到${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}6. 后端服务检查${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 检查本地端口
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] 本地端口 3001 ... "
if netstat -tlnp 2>/dev/null | grep -q ":3001" || lsof -i :3001 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 监听中${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${YELLOW}⚠️  未监听${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

# 检查本地服务
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3001/health 2>/dev/null || echo "000")
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
echo -n "  [$TOTAL_CHECKS] 本地服务 (localhost:3001) ... "
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ HTTP $HTTP_CODE${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${YELLOW}⚠️  HTTP $HTTP_CODE${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║   📊 检查结果汇总                                            ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "  总检查项: ${CYAN}$TOTAL_CHECKS${NC}"
echo -e "  通过: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "  失败: ${RED}$FAILED_CHECKS${NC}"
echo ""

# 计算通过率
PASS_RATE=$(echo "scale=1; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc)
echo -e "  通过率: ${CYAN}${PASS_RATE}%${NC}"
echo ""

# 总体评估
if [ "$FAILED_CHECKS" -eq 0 ]; then
    echo -e "${GREEN}✅ 所有检查项通过！系统运行正常。${NC}"
    EXIT_CODE=0
elif [ "$PASSED_CHECKS" -ge $((TOTAL_CHECKS * 2 / 3)) ]; then
    echo -e "${YELLOW}⚠️  部分检查项失败，但核心功能正常。${NC}"
    EXIT_CODE=1
else
    echo -e "${RED}❌ 多个检查项失败，系统可能存在问题。${NC}"
    EXIT_CODE=2
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}💡 建议操作${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$FAILED_CHECKS" -gt 0 ]; then
    echo -e "${YELLOW}如果检查失败，请尝试以下操作：${NC}"
    echo ""
    echo "1. 检查域名配置："
    echo "   ./scripts/deploy/fix-domain.sh"
    echo ""
    echo "2. 重启 Nginx："
    echo "   sudo nginx -t && sudo nginx -s reload"
    echo ""
    echo "3. 检查目标服务实例："
    echo "   确认域名或 BASE_URL 指向的服务已经运行，并且 /health 可访问"
    echo ""
    echo "4. 查看日志："
    echo "   sudo tail -f /var/log/nginx/sre-copilot-local-error.log"
    echo ""
    echo "5. 查看验证文档："
    echo "   cat docs/verification/VERIFICATION.MD"
    echo ""
fi

echo -e "${CYAN}检查完成时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""

exit $EXIT_CODE
