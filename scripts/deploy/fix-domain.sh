#!/bin/bash
# 域名配置统一修复脚本
# 用途：将所有配置文件中的域名统一为正确的域名

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║   🔧 域名配置统一修复工具                                    ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检查当前配置的域名
echo -e "${YELLOW}📋 检查当前配置...${NC}"
echo ""

CURRENT_DOMAINS=$(grep -r "sre-copilot\.example\.com" . 2>/dev/null | grep -v ".git" | grep -v "node_modules" | cut -d: -f2 | grep -o "sre-copilot\.example\.com[^/]*" | sort -u)

echo "发现以下域名配置："
echo "$CURRENT_DOMAINS" | while read domain; do
    echo "  - $domain"
done
echo ""

# 询问正确的域名
echo -e "${YELLOW}❓ 请选择正确的域名：${NC}"
echo "  1) sre-copilot.example.com"
echo "  2) app.example.com"
echo "  3) 自定义域名"
echo ""
read -p "请输入选项 (1/2/3): " choice

case $choice in
    1)
        CORRECT_DOMAIN="sre-copilot.example.com"
        ;;
    2)
        CORRECT_DOMAIN="app.example.com"
        ;;
    3)
        read -p "请输入自定义域名: " CORRECT_DOMAIN
        ;;
    *)
        echo -e "${RED}❌ 无效的选项${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✅ 将统一使用域名: ${CORRECT_DOMAIN}${NC}"
echo ""

# 确认操作
read -p "是否继续修改配置文件？(y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo -e "${YELLOW}⚠️  操作已取消${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}🔄 开始修改配置文件...${NC}"
echo ""

# 备份配置文件
BACKUP_DIR="config-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo -e "${YELLOW}📦 备份配置文件到: $BACKUP_DIR${NC}"

# 需要修改的文件列表
FILES_TO_UPDATE=(
    "nginx-local.conf"
    "scripts/deploy/setup-nginx.sh"
    "config/sync-config.sh"
    "config/backup-config.sh"
    "mcp-config.json"
)

# 修改配置文件
for file in "${FILES_TO_UPDATE[@]}"; do
    if [ -f "$file" ]; then
        echo -n "  处理: $file ... "
        
        # 备份
        cp "$file" "$BACKUP_DIR/"
        
        sed -i.bak "s/sre-copilot\.example\.com/$CORRECT_DOMAIN/g" "$file"
        rm -f "$file.bak"
        
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "  ${YELLOW}⚠️  文件不存在: $file${NC}"
    fi
done

echo ""
echo -e "${GREEN}✅ 配置文件修改完成${NC}"
echo ""

# 显示修改后的配置
echo -e "${BLUE}📋 修改后的配置预览：${NC}"
echo ""

echo "1. Nginx 本地配置 (nginx-local.conf):"
grep "server_name" nginx-local.conf 2>/dev/null || echo "   文件不存在"
echo ""

echo "2. Nginx 生产配置 (scripts/deploy/setup-nginx.sh):"
grep "DOMAIN=" scripts/deploy/setup-nginx.sh 2>/dev/null || echo "   文件不存在"
echo ""

# 提示后续操作
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║   📝 后续操作                                                ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}1. 重新加载 Nginx 配置：${NC}"
echo "   sudo nginx -t"
echo "   sudo nginx -s reload"
echo ""

echo -e "${YELLOW}2. 验证配置：${NC}"
echo "   ./scripts/test/test-domain-health.sh"
echo ""

echo -e "${YELLOW}4. 测试 Callback 接口：${NC}"
echo "   curl \"http://${CORRECT_DOMAIN}/wechat/callback?msg_signature=test&timestamp=1234567890&nonce=test&echostr=hello\""
echo ""

echo -e "${YELLOW}5. 更新企微后台配置：${NC}"
echo "   回调 URL: http://${CORRECT_DOMAIN}/wechat/callback"
echo ""

echo -e "${GREEN}✅ 域名配置修复完成！${NC}"
echo ""
echo -e "${BLUE}💾 配置文件已备份到: $BACKUP_DIR${NC}"
echo ""
