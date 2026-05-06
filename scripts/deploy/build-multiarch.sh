#!/bin/bash

# 多架构镜像构建脚本
# 为x86_64 (amd64) 和 ARM64 架构构建镜像

set -euo pipefail

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 生成版本标签
VERSION="v1.0.$(date +%Y%m%d-%H%M%S)"
REGISTRY="registry.example.com/sre-copilot"

# 目标架构
TARGET_ARCH="${1:-linux/amd64}"

log_info "🚀 开始多架构镜像构建"
log_info "版本: $VERSION"
log_info "目标架构: $TARGET_ARCH"

cd "$PROJECT_ROOT/backend"

# 构建WeChat服务镜像
log_step "构建WeChat服务镜像 ($TARGET_ARCH)"
docker buildx build \
    --platform "$TARGET_ARCH" \
    -f Dockerfile.wecom \
    -t "$REGISTRY/wecom-server:$VERSION" \
    . --push

# 构建API服务镜像
log_step "构建API服务镜像 ($TARGET_ARCH)"
docker buildx build \
    --platform "$TARGET_ARCH" \
    -f Dockerfile.api \
    -t "$REGISTRY/backend-api:$VERSION" \
    . --push

# 构建MCP服务镜像
log_step "构建MCP服务镜像 ($TARGET_ARCH)"
docker buildx build \
    --platform "$TARGET_ARCH" \
    -f Dockerfile.mcp \
    -t "$REGISTRY/mcp-server:$VERSION" \
    . --push

log_info "✅ 多架构镜像构建完成"
log_info "新版本标签: $VERSION"

# 更新SSH部署脚本中的版本
log_step "更新部署脚本中的镜像版本"
sed -i.bak "s/v1\.0\.[0-9]\{8\}-[0-9]\{6\}/$VERSION/g" "$SCRIPT_DIR/deploy-remote-ssh.sh"

log_info "🎉 构建和配置更新完成！"
log_info "现在可以运行: ./scripts/deploy/deploy-remote-ssh.sh --deploy-only"