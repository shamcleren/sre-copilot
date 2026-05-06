#!/bin/bash
# MCP 本地开发配置 - 统一加载环境变量

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 加载统一的环境配置
if [[ -f "$PROJECT_ROOT/load-env.sh" ]]; then
    source "$PROJECT_ROOT/load-env.sh"
    echo "MCP 配置加载完成"
    echo "MCP_PORT: $MCP_PORT"
    echo "MCP_API_KEY: ${MCP_API_KEY:0:20}..."
else
    echo "❌ 找不到环境配置加载脚本: $PROJECT_ROOT/load-env.sh"
    exit 1
fi