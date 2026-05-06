#!/bin/bash

# 备份当前配置到本地（只保存配置值，不保存YAML结构）
# 使用方式: ./config/backup-config.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
VALUES_FILE="$SCRIPT_DIR/real-config-values.env"
BACKUP_FILE="$SCRIPT_DIR/config-values-backup-$TIMESTAMP.env"

echo "🔄 备份当前配置值..."

# 获取当前配置信息
cd "$PROJECT_ROOT"

# 从 scripts/dev/config.local.sh 和 .env.secrets 读取配置（后者优先提供 WECOM_BOT_PUBLIC_URL）
if [[ -f "scripts/dev/config.local.sh" ]]; then
    source scripts/dev/config.local.sh
    echo "✅ 已加载本地配置"
else
    echo "⚠️  本地配置文件不存在，使用默认值"
fi
if [[ -f ".env.secrets" ]]; then
    set -a
    source .env.secrets 2>/dev/null || true
    set +a
fi

# 域名/基础 URL：优先使用 WECOM_BOT_PUBLIC_URL，否则默认
BOT_BASE="${WECOM_BOT_PUBLIC_URL:-}"
BOT_BASE="${BOT_BASE%/}"
[[ -z "$BOT_BASE" ]] && BOT_BASE="http://sre-copilot.example.com"
[[ "$BOT_BASE" != http* ]] && BOT_BASE="http://$BOT_BASE"
DOMAIN_FROM_CONFIG="${BOT_BASE#*://}"
DOMAIN_FROM_CONFIG="${DOMAIN_FROM_CONFIG%%/*}"
DOMAIN="${DOMAIN:-$DOMAIN_FROM_CONFIG}"
WECOM_CALLBACK_URL="${WECOM_CALLBACK_URL:-$BOT_BASE/wechat/callback}"
API_ENDPOINT="${API_ENDPOINT:-$BOT_BASE/api}"
MCP_ENDPOINT="${MCP_ENDPOINT:-$BOT_BASE/mcp}"

# 获取Git信息
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# 创建配置值文件
cat > "$VALUES_FILE" << EOF
# 真实配置值备份 - $TIMESTAMP
# Git: $GIT_BRANCH @ $GIT_COMMIT
# 这些是实际的配置值，仅保存值不保存YAML结构
# 请勿提交到git，已添加到.gitignore

# ===========================================
# 蓝鲸AI平台配置
# ===========================================
BK_APP_CODE=${BK_APP_CODE:-ai-sre-copilot}
BK_APP_SECRET=${BK_APP_SECRET:-unknown}

# ===========================================
# 数据库配置
# ===========================================
POSTGRES_HOST=${POSTGRES_HOST:-postgres-service.sre-copilot.svc.cluster.local}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_DB=${POSTGRES_DB:-sre_copilot}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-unknown}

# ===========================================
# 企微配置（当前工作版本）
# ===========================================
WECOM_TOKEN=${WECOM_TOKEN:-unknown}
WECOM_ENCODING_AES_KEY=${WECOM_ENCODING_AES_KEY:-unknown}
WECOM_CORP_ID=${WECOM_CORP_ID:-}
WECOM_WEBHOOK_URL=${WECOM_WEBHOOK_URL:-unknown}

# ===========================================
# 第三方API配置（可选）
# ===========================================
OPENAI_API_KEY=${OPENAI_API_KEY:-}
GEMINI_API_KEY=${GEMINI_API_KEY:-your-gemini-api-key}
GOOGLE_API_KEY=${GOOGLE_API_KEY:-your-gemini-api-key}

# ===========================================
# Docker镜像版本
# ===========================================
WECOM_SERVER_IMAGE=${WECOM_SERVER_IMAGE:-unknown}
BACKEND_API_IMAGE=${BACKEND_API_IMAGE:-unknown}
MCP_SERVER_IMAGE=${MCP_SERVER_IMAGE:-unknown}

# ===========================================
# 服务端点配置（来自 WECOM_BOT_PUBLIC_URL 或默认）
# ===========================================
DOMAIN=$DOMAIN
WECOM_CALLBACK_URL=$WECOM_CALLBACK_URL
API_ENDPOINT=$API_ENDPOINT
MCP_ENDPOINT=$MCP_ENDPOINT

# ===========================================
# 部署信息
# ===========================================
NAMESPACE=sre-copilot
LAST_DEPLOY_TIME=$TIMESTAMP
LAST_WORKING_COMMIT=$GIT_COMMIT
LAST_WORKING_BRANCH=$GIT_BRANCH
EOF

# 创建历史备份
cp "$VALUES_FILE" "$BACKUP_FILE"

echo "✅ 配置值已备份到: $VALUES_FILE"
echo "📎 历史备份: $BACKUP_FILE"
echo ""
echo "💡 恢复配置使用: ./config/restore-from-values.sh"