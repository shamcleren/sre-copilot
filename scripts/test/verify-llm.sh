#!/usr/bin/env bash
# 验证当前能力：Agent 回复 + 蓝鲸 AI 配置/调用
# 用法: ./scripts/test/verify-llm.sh [BASE_URL]，默认 http://localhost:3001
set -euo pipefail
BASE_URL="${1:-http://localhost:3001}"
AUTH_TOKEN="${AUTH_TOKEN:-${ADMIN_BOOTSTRAP_TOKEN:-}}"

if [ -z "$AUTH_TOKEN" ]; then
  echo "[ERROR] 未提供 AUTH_TOKEN（或 ADMIN_BOOTSTRAP_TOKEN），无法调用受保护接口 /api/chat"
  echo "示例：AUTH_TOKEN=<token> ./scripts/test/verify-llm.sh ${BASE_URL}"
  exit 2
fi

echo "=== 1. 配置检查（含蓝鲸 AI）==="
curl -s "${BASE_URL}/wechat/config-check" | head -80
echo ""

echo "=== 2. Agent 对话（POST /api/chat）==="
RESP=$(curl -s -X POST "${BASE_URL}/api/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{"message":"你好，请用一句话介绍你自己","strategy":"AUTO"}')
echo "$RESP" | head -40
if echo "$RESP" | grep -q '"success":true'; then
  echo "[OK] /api/chat 返回 success"
else
  echo "[WARN] /api/chat 未返回 success，请检查服务与配置"
fi
echo ""

echo "=== 3. 蓝鲸 AI 说明 ==="
echo "若 llm.BK_AI 为 true，则上述回复由蓝鲸 AI 平台 LLM 生成；为 false 时为占位回复。"
echo "配置方式：在 .env.secrets 或 K8s Secret 中设置 BK_AI_GATEWAY_URL、BK_APP_CODE、BK_APP_SECRET（及可选 BK_LLM_MODEL）。"
