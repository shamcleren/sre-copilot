#!/bin/bash
# 从 .env.secrets 重建 K8s Secret
# 注意：远端 Postgres 数据卷初始化时密码已锁定为 "postgres"，
#       .env.secrets 中的强密码从未在 PG 数据卷生效过。
#       因此 POSTGRES_PASSWORD 固定使用 "postgres"，忽略 .env.secrets 中的值。
set -e
cd /data/sre-copilot
set -a
source .env.secrets
set +a

# 远端 PG 实际密码（数据卷初始化时锁定）
ACTUAL_PG_PASSWORD="postgres"

kubectl create secret generic sre-copilot-secret \
  --namespace=sre-copilot \
  --from-literal=POSTGRES_PASSWORD="$ACTUAL_PG_PASSWORD" \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --from-literal=ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  --from-literal=WECOM_TOKEN="$WECOM_TOKEN" \
  --from-literal=WECOM_ENCODING_AES_KEY="$WECOM_ENCODING_AES_KEY" \
  --from-literal=WECOM_CORP_ID="$WECOM_CORP_ID" \
  --from-literal=WECOM_AGENT_ID="$WECOM_AGENT_ID" \
  --from-literal=WECOM_SECRET="$WECOM_SECRET" \
  --from-literal=WECOM_WEBHOOK_URL="$WECOM_WEBHOOK_URL" \
  --from-literal=WECOM_WHITELIST="$WECOM_WHITELIST" \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY" \
  --from-literal=GEMINI_API_KEY="$GEMINI_API_KEY" \
  --from-literal=BK_AI_GATEWAY_URL="$BK_AI_GATEWAY_URL" \
  --from-literal=BK_APP_CODE="$BK_APP_CODE" \
  --from-literal=BK_APP_SECRET="$BK_APP_SECRET" \
  --from-literal=BK_LLM_MODEL="$BK_LLM_MODEL" \
  --from-literal=ADMIN_BOOTSTRAP_TOKEN="$ADMIN_BOOTSTRAP_TOKEN" \
  --from-literal=MINIMAX_API_KEY="${MINIMAX_API_KEY:-}" \
  --from-literal=MINIMAX_BASE_URL="${MINIMAX_BASE_URL:-}" \
  --from-literal=MINIMAX_LLM_MODEL="${MINIMAX_LLM_MODEL:-}" \
  --from-literal=MCP_API_KEY="${MCP_API_KEY:-}" \
  --from-literal=MCP_SECRET_KEY="${MCP_SECRET_KEY:-}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secret rebuilt OK (POSTGRES_PASSWORD=$ACTUAL_PG_PASSWORD)"
