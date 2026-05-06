#!/bin/bash

# 配置同步脚本 - 确保开发和生产配置一致性
# 使用方式: ./config/sync-config.sh [dev-to-prod|prod-to-dev|check]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEV_CONFIG="$PROJECT_ROOT/scripts/dev/config.local.sh"
PROD_CONFIG="$SCRIPT_DIR/real-config-values.env"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_debug() { echo -e "${BLUE}[DEBUG]${NC} $1"; }

# 提取配置值的函数
get_config_value() {
    local file="$1"
    local key="$2"
    
    if [[ "$file" == *".env" ]]; then
        # .env 格式: KEY=value
        grep "^$key=" "$file" 2>/dev/null | cut -d'=' -f2- | sed 's/^"//;s/"$//'
    else
        # .sh 格式: export KEY="value"
        grep "export $key=" "$file" 2>/dev/null | cut -d'"' -f2
    fi
}

# 检查配置一致性
check_consistency() {
    log_info "检查配置一致性..."
    
    if [[ ! -f "$DEV_CONFIG" ]]; then
        log_error "开发配置文件不存在: $DEV_CONFIG"
        return 1
    fi
    
    if [[ ! -f "$PROD_CONFIG" ]]; then
        log_error "生产配置文件不存在: $PROD_CONFIG"
        return 1
    fi
    
    # 需要检查一致性的配置项
    SYNC_KEYS=(
        "WECOM_TOKEN"
        "WECOM_ENCODING_AES_KEY"
        "WECOM_WEBHOOK_URL"
        "BK_APP_CODE"
        "BK_APP_SECRET"
        "POSTGRES_PASSWORD"
    )
    
    local inconsistent=0
    
    echo ""
    echo "配置一致性检查结果:"
    echo "===================="
    
    for key in "${SYNC_KEYS[@]}"; do
        local dev_value=$(get_config_value "$DEV_CONFIG" "$key")
        local prod_value=$(get_config_value "$PROD_CONFIG" "$key")
        
        if [[ "$dev_value" == "$prod_value" ]]; then
            echo -e "✅ $key: ${GREEN}一致${NC}"
        else
            echo -e "❌ $key: ${RED}不一致${NC}"
            echo "   开发环境: ${dev_value:0:20}..."
            echo "   生产环境: ${prod_value:0:20}..."
            inconsistent=1
        fi
    done
    
    echo ""
    if [[ $inconsistent -eq 0 ]]; then
        log_info "✅ 所有配置项都一致"
        return 0
    else
        log_warn "⚠️  发现配置不一致，建议同步"
        return 1
    fi
}

# 从生产同步到开发
sync_prod_to_dev() {
    log_info "从生产配置同步到开发配置..."
    
    if [[ ! -f "$PROD_CONFIG" ]]; then
        log_error "生产配置文件不存在: $PROD_CONFIG"
        return 1
    fi
    
    # 备份开发配置
    cp "$DEV_CONFIG" "$DEV_CONFIG.backup.$(date +%Y%m%d-%H%M%S)"
    log_info "已备份开发配置"
    
    # 读取生产配置
    source "$PROD_CONFIG"
    
    # 更新开发配置
    cat > "$DEV_CONFIG" << EOF
#!/bin/bash
# 本地开发配置 - 从生产配置同步
# 请勿提交到git

# 企微配置
export WECOM_TOKEN="$WECOM_TOKEN"
export WECOM_ENCODING_AES_KEY="$WECOM_ENCODING_AES_KEY"
export WECOM_CORP_ID="$WECOM_CORP_ID"
export WECOM_WEBHOOK_URL="$WECOM_WEBHOOK_URL"

# 蓝鲸AI配置
export BK_APP_CODE="$BK_APP_CODE"
export BK_APP_SECRET="$BK_APP_SECRET"

# 数据库配置
export POSTGRES_HOST="$POSTGRES_HOST"
export POSTGRES_PORT="$POSTGRES_PORT"
export POSTGRES_DB="$POSTGRES_DB"
export POSTGRES_USER="$POSTGRES_USER"
export POSTGRES_PASSWORD="$POSTGRES_PASSWORD"

# Docker镜像版本
export WECOM_SERVER_IMAGE="$WECOM_SERVER_IMAGE"
export BACKEND_API_IMAGE="$BACKEND_API_IMAGE"
export MCP_SERVER_IMAGE="$MCP_SERVER_IMAGE"

echo "✅ 本地开发配置已加载"
EOF
    
    chmod +x "$DEV_CONFIG"
    log_info "✅ 开发配置已更新"
}

# 从开发同步到生产
sync_dev_to_prod() {
    log_info "从开发配置同步到生产配置..."
    
    if [[ ! -f "$DEV_CONFIG" ]]; then
        log_error "开发配置文件不存在: $DEV_CONFIG"
        return 1
    fi
    
    # 加载开发配置
    source "$DEV_CONFIG"
    # 优先从 .env.secrets 读取 WECOM_BOT_PUBLIC_URL 作为域名来源
    if [[ -f "$PROJECT_ROOT/.env.secrets" ]]; then
        set -a
        source "$PROJECT_ROOT/.env.secrets" 2>/dev/null || true
        set +a
    fi
    BOT_BASE="${WECOM_BOT_PUBLIC_URL:-http://sre-copilot.example.com}"
    BOT_BASE="${BOT_BASE%/}"
    [[ "$BOT_BASE" != http* ]] && BOT_BASE="http://$BOT_BASE"
    SYNC_DOMAIN="${BOT_BASE#*://}"
    SYNC_DOMAIN="${SYNC_DOMAIN%%/*}"
    SYNC_WECOM_CALLBACK="$BOT_BASE/wechat/callback"
    SYNC_API_ENDPOINT="$BOT_BASE/api"
    SYNC_MCP_ENDPOINT="$BOT_BASE/mcp"
    
    # 备份生产配置
    cp "$PROD_CONFIG" "$PROD_CONFIG.backup.$(date +%Y%m%d-%H%M%S)"
    log_info "已备份生产配置"
    
    # 更新生产配置
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    GIT_COMMIT=$(cd "$PROJECT_ROOT" && git rev-parse HEAD 2>/dev/null || echo "unknown")
    GIT_BRANCH=$(cd "$PROJECT_ROOT" && git branch --show-current 2>/dev/null || echo "unknown")
    
    cat > "$PROD_CONFIG" << EOF
# 真实配置值备份 - $TIMESTAMP
# Git: $GIT_BRANCH @ $GIT_COMMIT
# 从开发配置同步
# 请勿提交到git，已添加到.gitignore

# ===========================================
# 蓝鲸AI平台配置
# ===========================================
BK_APP_CODE=$BK_APP_CODE
BK_APP_SECRET=$BK_APP_SECRET

# ===========================================
# 数据库配置
# ===========================================
POSTGRES_HOST=$POSTGRES_HOST
POSTGRES_PORT=$POSTGRES_PORT
POSTGRES_DB=$POSTGRES_DB
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# ===========================================
# 企微配置（当前工作版本）
# ===========================================
WECOM_TOKEN=$WECOM_TOKEN
WECOM_ENCODING_AES_KEY=$WECOM_ENCODING_AES_KEY
WECOM_CORP_ID=$WECOM_CORP_ID
WECOM_WEBHOOK_URL=$WECOM_WEBHOOK_URL

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
# 服务端点配置（来自 WECOM_BOT_PUBLIC_URL）
# ===========================================
DOMAIN=$SYNC_DOMAIN
WECOM_CALLBACK_URL=$SYNC_WECOM_CALLBACK
API_ENDPOINT=$SYNC_API_ENDPOINT
MCP_ENDPOINT=$SYNC_MCP_ENDPOINT

# ===========================================
# 部署信息
# ===========================================
NAMESPACE=sre-copilot
LAST_DEPLOY_TIME=$TIMESTAMP
LAST_WORKING_COMMIT=$GIT_COMMIT
LAST_WORKING_BRANCH=$GIT_BRANCH
EOF
    
    log_info "✅ 生产配置已更新"
}

# 显示使用帮助
show_help() {
    echo "配置同步脚本"
    echo ""
    echo "使用方式:"
    echo "  $0 check           # 检查配置一致性"
    echo "  $0 prod-to-dev     # 从生产配置同步到开发配置"
    echo "  $0 dev-to-prod     # 从开发配置同步到生产配置"
    echo "  $0 help            # 显示帮助"
    echo ""
    echo "文件路径:"
    echo "  开发配置: $DEV_CONFIG"
    echo "  生产配置: $PROD_CONFIG"
}

# 主逻辑
case "${1:-check}" in
    "check")
        check_consistency
        ;;
    "prod-to-dev")
        sync_prod_to_dev
        echo ""
        log_info "同步完成，建议运行检查: $0 check"
        ;;
    "dev-to-prod")
        sync_dev_to_prod
        echo ""
        log_info "同步完成，建议运行检查: $0 check"
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        log_error "未知命令: $1"
        show_help
        exit 1
        ;;
esac