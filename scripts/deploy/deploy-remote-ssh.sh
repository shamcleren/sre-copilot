#!/bin/bash

# 远程SSH K8s部署脚本
# 通过SSH连接到远程dev环境进行K8s部署

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
        log_info "请先创建并配置 scripts/dev/ssh-config.local 文件"
        exit 1
    fi
    
    source "$config_file"
    
    # 设置默认值
    SSH_COMMAND="${SSH_COMMAND:-ssh dev}"
    REMOTE_NAMESPACE="${REMOTE_NAMESPACE:-sre-copilot}"
    REMOTE_DEPLOY_DIR="${REMOTE_DEPLOY_DIR:-/opt/sre-copilot}"
    REMOTE_KUBECTL_PATH="${REMOTE_KUBECTL_PATH:-kubectl}"
    
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

# 检查远程K8s环境
check_remote_k8s() {
    log_step "检查远程K8s环境..."
    
    local remote_cmd="$REMOTE_KUBECTL_PATH cluster-info --request-timeout=10s"
    
    if execute_remote_command "$remote_cmd" >/dev/null 2>&1; then
        log_info "✅ 远程K8s集群连接正常"
    else
        log_error "❌ 远程K8s集群连接失败"
        log_info "请检查远程服务器的kubectl配置"
        exit 1
    fi
}

# 执行远程命令
execute_remote_command() {
    local command="$1"
    $SSH_COMMAND "$command"
}

# 同步部署文件到远程
sync_deployment_files() {
    log_step "同步部署文件到远程服务器..."
    
    # 创建远程目录
    execute_remote_command "mkdir -p $REMOTE_DEPLOY_DIR"
    
    # 使用scp同步K8s配置文件 (通过ssh dev)
    scp -r "$PROJECT_ROOT/k8s/" dev:"$REMOTE_DEPLOY_DIR/"
    
    log_info "✅ 部署文件同步完成"
}

# 远程部署
deploy_to_remote_k8s() {
    log_step "开始远程K8s部署..."
    
    # 使用x86_64架构的镜像版本
    local VERSION="v1.0.20260205-225003-amd64"
    local WECOM_IMAGE="registry.example.com/sre-copilot/wecom-server:$VERSION"
    local API_IMAGE="registry.example.com/sre-copilot/backend-api:$VERSION"
    local MCP_IMAGE="registry.example.com/sre-copilot/mcp-server:$VERSION"
    
    log_info "使用镜像版本: $VERSION"
    
    # 构建远程部署命令，包含镜像占位符替换
    local remote_deploy_cmd="
        cd $REMOTE_DEPLOY_DIR && 
        $REMOTE_KUBECTL_PATH apply -f k8s/generated/postgresql.yaml &&
        sed -e 's|__WECOM_IMAGE__|$WECOM_IMAGE|g' \\
            -e 's|__API_IMAGE__|$API_IMAGE|g' \\
            -e 's|__MCP_IMAGE__|$MCP_IMAGE|g' \\
            k8s/generated/sre-copilot-services.yaml | $REMOTE_KUBECTL_PATH apply -f - &&
        echo '等待服务启动...' &&
        sleep 10 &&
        $REMOTE_KUBECTL_PATH get pods -n $REMOTE_NAMESPACE
    "
    
    log_info "执行远程部署命令..."
    if execute_remote_command "$remote_deploy_cmd"; then
        log_info "✅ 远程K8s部署成功"
    else
        log_error "❌ 远程K8s部署失败"
        exit 1
    fi
}

# 验证部署状态
verify_deployment() {
    log_step "验证部署状态..."
    
    log_info "检查Pod状态:"
    execute_remote_command "$REMOTE_KUBECTL_PATH get pods -n $REMOTE_NAMESPACE"
    
    log_info "检查Service状态:"
    execute_remote_command "$REMOTE_KUBECTL_PATH get services -n $REMOTE_NAMESPACE"
    
    log_info "检查最新镜像版本:"
    execute_remote_command "$REMOTE_KUBECTL_PATH describe pods -n $REMOTE_NAMESPACE | grep 'Image:' | grep sre-copilot"
}

# 显示帮助信息
show_help() {
    cat << EOF
远程SSH K8s部署脚本

用法: $0 [选项]

选项:
    --test-only     仅测试SSH连接和K8s环境
    --sync-only     仅同步文件，不执行部署
    --deploy-only   仅执行部署，不同步文件
    --help          显示此帮助信息

示例:
    $0                    # 完整部署流程
    $0 --test-only        # 仅测试连接
    $0 --sync-only        # 仅同步文件
    $0 --deploy-only      # 仅部署

配置文件: scripts/dev/ssh-config.local
EOF
}

# 主函数
main() {
    local test_only=false
    local sync_only=false
    local deploy_only=false
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --test-only)
                test_only=true
                shift
                ;;
            --sync-only)
                sync_only=true
                shift
                ;;
            --deploy-only)
                deploy_only=true
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
    
    log_info "🚀 开始远程SSH K8s部署"
    
    # 加载配置
    load_ssh_config
    
    # 测试连接
    test_ssh_connection
    check_remote_k8s
    
    if [[ "$test_only" == true ]]; then
        log_info "✅ 连接测试完成"
        exit 0
    fi
    
    # 同步文件
    if [[ "$deploy_only" != true ]]; then
        sync_deployment_files
    fi
    
    if [[ "$sync_only" == true ]]; then
        log_info "✅ 文件同步完成"
        exit 0
    fi
    
    # 执行部署
    deploy_to_remote_k8s
    
    # 验证部署
    verify_deployment
    
    log_info "🎉 远程SSH K8s部署完成！"
}

# 执行主函数
main "$@"