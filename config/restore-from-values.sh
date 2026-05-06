#!/bin/bash

# 从配置值恢复 Secret / ConfigMap
# 使用方式: ./config/restore-from-values.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/real-config-values.env"
RESTORE_DIR="$SCRIPT_DIR/restored"
LOCAL_CONFIG_FILE="$PROJECT_ROOT/scripts/dev/config.local.sh"

mkdir -p "$RESTORE_DIR"

echo "🔄 从配置值恢复配置文件..."

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    echo "请先运行 ./config/backup-config.sh 创建配置备份"
    exit 1
fi

echo "📖 加载配置值..."
set -a
source "$CONFIG_FILE"
set +a

if [[ -z "${WECOM_TOKEN:-}" || -z "${WECOM_ENCODING_AES_KEY:-}" ]]; then
    echo "❌ 缺少必要的企微配置"
    exit 1
fi

echo "🔐 创建 Secret 配置..."
cat > "$RESTORE_DIR/restored-secret.yaml" << EOF
apiVersion: v1
kind: Secret
metadata:
  name: sre-copilot-secret
  namespace: sre-copilot
type: Opaque
stringData:
  BK_APP_CODE: "${BK_APP_CODE:-}"
  BK_APP_SECRET: "${BK_APP_SECRET:-}"
  POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-}"
  WECOM_TOKEN: "${WECOM_TOKEN:-}"
  WECOM_ENCODING_AES_KEY: "${WECOM_ENCODING_AES_KEY:-}"
  WECOM_CORP_ID: "${WECOM_CORP_ID:-}"
  WECOM_WEBHOOK_URL: "${WECOM_WEBHOOK_URL:-}"
  OPENAI_API_KEY: "${OPENAI_API_KEY:-}"
  GEMINI_API_KEY: "${GEMINI_API_KEY:-}"
  GOOGLE_API_KEY: "${GOOGLE_API_KEY:-}"
EOF

echo "⚙️ 创建 ConfigMap 配置..."
cat > "$RESTORE_DIR/restored-configmap.yaml" << EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: sre-copilot-config
  namespace: sre-copilot
data:
  POSTGRES_HOST: "${POSTGRES_HOST:-}"
  POSTGRES_PORT: "${POSTGRES_PORT:-}"
  POSTGRES_DB: "${POSTGRES_DB:-}"
  POSTGRES_USER: "${POSTGRES_USER:-}"
  DOMAIN: "${DOMAIN:-}"
  WECOM_CALLBACK_URL: "${WECOM_CALLBACK_URL:-}"
  API_ENDPOINT: "${API_ENDPOINT:-}"
  MCP_ENDPOINT: "${MCP_ENDPOINT:-}"
  NAMESPACE: "${NAMESPACE:-sre-copilot}"
  LAST_DEPLOY_TIME: "$(date '+%Y-%m-%d %H:%M:%S')"
EOF

echo "🔧 更新本地开发配置..."
cat > "$LOCAL_CONFIG_FILE" << EOF
#!/bin/bash
# 本地开发配置 - 从真实配置值恢复
# 请勿提交到 git

export WECOM_TOKEN="${WECOM_TOKEN:-}"
export WECOM_ENCODING_AES_KEY="${WECOM_ENCODING_AES_KEY:-}"
export WECOM_CORP_ID="${WECOM_CORP_ID:-}"
export WECOM_WEBHOOK_URL="${WECOM_WEBHOOK_URL:-}"

export BK_APP_CODE="${BK_APP_CODE:-}"
export BK_APP_SECRET="${BK_APP_SECRET:-}"

export POSTGRES_HOST="${POSTGRES_HOST:-}"
export POSTGRES_PORT="${POSTGRES_PORT:-}"
export POSTGRES_DB="${POSTGRES_DB:-}"
export POSTGRES_USER="${POSTGRES_USER:-}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

export WECOM_SERVER_IMAGE="${WECOM_SERVER_IMAGE:-}"
export BACKEND_API_IMAGE="${BACKEND_API_IMAGE:-}"
export MCP_SERVER_IMAGE="${MCP_SERVER_IMAGE:-}"

echo "✅ 本地开发配置已加载"
EOF

chmod +x "$LOCAL_CONFIG_FILE"

echo "✅ 配置恢复完成！"
echo ""
echo "📁 生成的文件:"
echo "  - config/restored/restored-secret.yaml"
echo "  - config/restored/restored-configmap.yaml"
echo "  - scripts/dev/config.local.sh"
echo ""
echo "🚀 应用到 K8s 集群:"
echo "  kubectl apply -f config/restored/restored-secret.yaml"
echo "  kubectl apply -f config/restored/restored-configmap.yaml"
echo ""
echo "🔄 重启服务以加载新配置:"
echo "  kubectl rollout restart deployment/sre-copilot-app -n sre-copilot"
