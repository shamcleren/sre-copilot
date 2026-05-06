#!/bin/bash

# 远程构建脚本 - 在远程dev环境进行原生Linux x64构建
# 避免本地ARM64架构与远程x86_64不兼容的问题

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

# 加载SSH配置
load_ssh_config() {
    local config_file="$SCRIPT_DIR/ssh-config.local"
    
    if [[ ! -f "$config_file" ]]; then
        log_error "SSH配置文件不存在: $config_file"
        exit 1
    fi
    
    source "$config_file"
    SSH_COMMAND="${SSH_COMMAND:-ssh dev}"
    REMOTE_BUILD_DIR="${REMOTE_BUILD_DIR:-/tmp/sre-copilot-build}"
    
    log_info "已加载SSH配置: $SSH_COMMAND"
}

# 测试SSH连接
test_ssh_connection() {
    log_step "测试SSH连接..."
    
    if $SSH_COMMAND "echo 'SSH连接成功'" >/dev/null 2>&1; then
        log_info "✅ SSH连接测试成功"
    else
        log_error "❌ SSH连接失败，请检查 'ssh dev' 配置"
        exit 1
    fi
}

# 检查远程Docker环境
check_remote_docker() {
    log_step "检查远程Docker环境..."
    
    if $SSH_COMMAND "docker --version" >/dev/null 2>&1; then
        log_info "✅ 远程Docker环境正常"
        $SSH_COMMAND "docker --version"
    else
        log_error "❌ 远程Docker环境不可用"
        exit 1
    fi
}

# 同步源代码到远程
sync_source_code() {
    log_step "同步源代码到远程构建环境..."
    
    # 创建远程构建目录
    $SSH_COMMAND "rm -rf $REMOTE_BUILD_DIR && mkdir -p $REMOTE_BUILD_DIR"
    
    # 使用rsync同步代码，排除不必要的文件
    rsync -avz --progress \
        --exclude='.git/' \
        --exclude='__pycache__/' \
        --exclude='*.js.map' \
        --exclude='.env*' \
        --exclude='node_modules/' \
        --exclude='.codebuddy/' \
        --exclude='.cursor/' \
        "$PROJECT_ROOT/" dev:"$REMOTE_BUILD_DIR/"
    
    log_info "✅ 源代码同步完成"
}

# 远程构建镜像
build_images_remotely() {
    log_step "在远程环境构建优化的Docker镜像..."
    
    # 生成版本标签
    VERSION="v1.0.$(date +%Y%m%d-%H%M%S)"
    REGISTRY="registry.example.com/sre-copilot"
    
    log_info "构建版本: $VERSION"
    log_info "目标架构: linux/amd64 (原生)"
    log_info "使用简化的Dockerfile和腾讯云PyPI镜像源"
    
    # 构建远程命令，启用BuildKit和缓存
    local remote_build_cmd="
        cd $REMOTE_BUILD_DIR/backend &&
        export DOCKER_BUILDKIT=1 &&
        echo '=== 构建WeChat服务镜像 (简化版) ===' &&
        docker build --progress=plain \\
            -f Dockerfile.wecom -t $REGISTRY/wecom-server:$VERSION . &&
        echo '=== 构建API服务镜像 (简化版) ===' &&
        docker build --progress=plain \\
            -f Dockerfile.api -t $REGISTRY/backend-api:$VERSION . &&
        echo '=== 构建MCP服务镜像 (简化版) ===' &&
        docker build --progress=plain \\
            -f Dockerfile.mcp -t $REGISTRY/mcp-server:$VERSION . &&
        echo '=== 推送镜像到仓库 ===' &&
        docker push $REGISTRY/wecom-server:$VERSION &&
        docker push $REGISTRY/backend-api:$VERSION &&
        docker push $REGISTRY/mcp-server:$VERSION &&
        echo '=== 构建完成 ===' &&
        echo 'VERSION=$VERSION'
    "
    
    log_info "执行远程构建（使用简化的Dockerfile和腾讯云PyPI镜像源）..."
    if $SSH_COMMAND "$remote_build_cmd"; then
        log_info "✅ 远程镜像构建成功"
        echo "$VERSION" > "$SCRIPT_DIR/.last-build-version"
        log_info "版本信息已保存到: $SCRIPT_DIR/.last-build-version"
    else
        log_error "❌ 远程镜像构建失败"
        exit 1
    fi
}

# 验证构建的镜像
verify_built_images() {
    log_step "验证构建的镜像..."
    
    if [[ ! -f "$SCRIPT_DIR/.last-build-version" ]]; then
        log_error "找不到版本信息文件"
        exit 1
    fi
    
    VERSION=$(cat "$SCRIPT_DIR/.last-build-version")
    REGISTRY="registry.example.com/sre-copilot"
    
    log_info "验证版本: $VERSION"
    
    # 检查远程镜像
    local verify_cmd="
        echo '=== 检查本地镜像 ===' &&
        docker images | grep sre-copilot | grep $VERSION &&
        echo '=== 检查镜像详情 ===' &&
        docker inspect $REGISTRY/wecom-server:$VERSION --format='{{.Architecture}} {{.Os}}' &&
        docker inspect $REGISTRY/backend-api:$VERSION --format='{{.Architecture}} {{.Os}}' &&
        docker inspect $REGISTRY/mcp-server:$VERSION --format='{{.Architecture}} {{.Os}}'
    "
    
    if $SSH_COMMAND "$verify_cmd"; then
        log_info "✅ 镜像验证成功"
    else
        log_warn "⚠️  镜像验证有问题，但可能仍可使用"
    fi
}

# 更新部署脚本中的版本
update_deployment_version() {
    log_step "更新部署脚本中的镜像版本..."
    
    if [[ ! -f "$SCRIPT_DIR/.last-build-version" ]]; then
        log_error "找不到版本信息文件"
        exit 1
    fi
    
    VERSION=$(cat "$SCRIPT_DIR/.last-build-version")
    
    # 更新SSH部署脚本中的版本
    if [[ -f "$SCRIPT_DIR/deploy-remote-ssh.sh" ]]; then
        # 备份原文件
        cp "$SCRIPT_DIR/deploy-remote-ssh.sh" "$SCRIPT_DIR/deploy-remote-ssh.sh.bak"
        
        # 更新版本号（移除-amd64后缀，因为这是原生构建）
        sed -i.tmp "s/v1\.0\.[0-9]\{8\}-[0-9]\{6\}[^\"]*/$VERSION/g" "$SCRIPT_DIR/deploy-remote-ssh.sh"
        rm -f "$SCRIPT_DIR/deploy-remote-ssh.sh.tmp"
        
        log_info "✅ 部署脚本版本已更新为: $VERSION"
    else
        log_warn "部署脚本不存在，跳过版本更新"
    fi
}

# 清理远程构建环境
cleanup_remote_build() {
    log_step "清理远程构建环境..."
    
    $SSH_COMMAND "rm -rf $REMOTE_BUILD_DIR"
    log_info "✅ 远程构建环境已清理"
}

# 显示帮助信息
show_help() {
    cat << EOF
远程构建脚本 - 在远程dev环境进行原生Linux x64构建

用法: $0 [选项]

选项:
    --test-only       仅测试连接和环境
    --build-only      仅构建镜像，不更新部署脚本
    --no-cleanup      构建后不清理远程环境
    --help            显示此帮助信息

示例:
    $0                # 完整构建流程
    $0 --test-only    # 仅测试环境
    $0 --build-only   # 仅构建镜像
    $0 --no-cleanup   # 构建后保留远程文件

配置文件: scripts/dev/ssh-config.local
EOF
}

# 主函数
main() {
    local test_only=false
    local build_only=false
    local no_cleanup=false
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --test-only)
                test_only=true
                shift
                ;;
            --build-only)
                build_only=true
                shift
                ;;
            --no-cleanup)
                no_cleanup=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    log_info "🚀 开始远程构建流程"
    
    # 加载配置
    load_ssh_config
    
    # 测试连接
    test_ssh_connection
    check_remote_docker
    
    if [[ "$test_only" == true ]]; then
        log_info "✅ 环境测试完成"
        exit 0
    fi
    
    # 构建流程
    sync_source_code
    build_images_remotely
    verify_built_images
    
    if [[ "$build_only" != true ]]; then
        update_deployment_version
    fi
    
    if [[ "$no_cleanup" != true ]]; then
        cleanup_remote_build
    fi
    
    log_info "🎉 远程构建完成！"
    
    if [[ -f "$SCRIPT_DIR/.last-build-version" ]]; then
        VERSION=$(cat "$SCRIPT_DIR/.last-build-version")
        log_info "新版本: $VERSION"
        log_info "现在可以运行: ./scripts/deploy/deploy-remote-ssh.sh --deploy-only"
    fi
}

# 执行主函数
main "$@"