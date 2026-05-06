#!/bin/bash
# 本地开发配置示例
# 复制为 config.local.sh 并修改（该文件不会提交 git）

# ============ 远程 Dev 机器配置 ============
# SSH 连接信息
DEV_HOST="your-dev-host.com"          # 远程 dev 机器地址
DEV_USER="your-username"               # SSH 用户名
DEV_PORT="22"                          # SSH 端口

# 远程目录
REMOTE_DIR="/data/sre-copilot"       # 远程部署目录

# ============ K8s 配置 ============
# Namespace
NAMESPACE="sre-copilot"

# 镜像配置（如果使用私有仓库）
# IMAGE_REGISTRY="your-registry.com"
# 未设置时自动生成：日期-短 commit，如 20260205-a1b2c3d
# IMAGE_TAG="20260205-a1b2c3d"

# ============ 数据库配置 ============
# PostgreSQL（远程 K8s 中运行）
POSTGRES_HOST="localhost"              # 通过端口转发访问，保持 localhost
POSTGRES_PORT="5432"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="YOUR_STRONG_PASSWORD"  # ⚠️ 请设置强密码
POSTGRES_DB="team_memory"

# ============ API Keys ============
# Gemini API（本地开发使用）
GEMINI_API_KEY="your-gemini-api-key"
GOOGLE_API_KEY="your-gemini-api-key"

# OpenAI（可选）
# OPENAI_API_KEY="your-openai-api-key"

# ============ 蓝鲸 AI 平台 ============
# 网关地址为敏感信息，仅配置在 .env.secrets 中；此处仅作占位说明
# BK_AI_GATEWAY_URL="https://your-bk-ai-gateway-url"
BK_APP_CODE="your-app-code"
BK_APP_SECRET="your-app-secret"
BK_EMBEDDING_MODEL="qwen3-embedding-8B"

# ============ 企业微信 ============
# Webhook（单向推送到群）
WECOM_WEBHOOK_URL="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"

# 双向交互配置（接收消息回调）
# 在企业微信管理后台 - 群机器人 - 接收消息配置 中获取
WECOM_CORP_ID=""                    # 企业ID（如果是群机器人，可留空）
WECOM_TOKEN=""                      # Token（点击「随机获取」）
WECOM_ENCODING_AES_KEY=""           # EncodingAESKey（点击「随机获取」）

# ============ 本地开发配置 ============
# API 服务
API_HOST="0.0.0.0"
API_PORT="3001"

# 知识库路径（本地）
KNOWLEDGE_BASE_PATH="$HOME/ai-memory-system/personal/shamcleren/shared/knowledge"

# 默认角色
DEFAULT_ROLE="shamcleren"
