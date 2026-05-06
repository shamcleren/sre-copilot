#!/bin/bash

# 优化的远程部署脚本
# 集成安全配置渲染、Docker构建优化和K8s部署

set -euo pipefail

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 配置
REMOTE_HOST="dev"
REMOTE_PROJECT_DIR="/data/sre-copilot"
REGISTRY="localhost:5000"
TAG="$(date +%Y%m%d-%H%M%S)"

# 日志函数
log_info() {
    echo "🚀 [$(date '+%H:%M:%S')] $1"
}

log_error() {
    echo "❌ [$(date '+%H:%M:%S')] $1" >&2
}

log_success() {
    echo "✅ [$(date '+%H:%M:%S')] $1"
}

log_warning() {
    echo "⚠️  [$(date '+%H:%M:%S')] $1"
}

# 检查SSH连接
check_ssh_connection() {
    log_info "检查SSH连接到 $REMOTE_HOST..."
    
    if ! ssh -o ConnectTimeout=10 "$REMOTE_HOST" "echo 'SSH连接正常'" >/dev/null 2>&1; then
        log_error "无法连接到远程主机: $REMOTE_HOST"
        exit 1
    fi
    
    log_success "SSH连接检查完成"
}

# 生成安全配置
generate_secure_configs() {
    log_info "生成安全配置文件..."
    
    # 运行配置渲染脚本
    if ! "$PROJECT_ROOT/scripts/deploy/render-k8s-config.sh"; then
        log_error "安全配置生成失败"
        exit 1
    fi
    
    log_success "安全配置生成完成"
}

# 同步代码到远程
sync_code_to_remote() {
    log_info "同步代码到远程主机..."
    
    # 排除敏感文件和不必要的文件
    local rsync_excludes=(
        "--exclude=.git"
        "--exclude=.env.secrets"
        "--exclude=k8s/generated/"
        "--exclude=__pycache__"
        "--exclude=*.pyc"
        "--exclude=.pytest_cache"
        "--exclude=node_modules"
        "--exclude=.DS_Store"
    )
    
    if ! rsync -avz --delete "${rsync_excludes[@]}" \
        "$PROJECT_ROOT/" "$REMOTE_HOST:$REMOTE_PROJECT_DIR/"; then
        log_error "代码同步失败"
        exit 1
    fi
    
    log_success "代码同步完成"
}

# 同步生成的K8s配置
sync_k8s_configs() {
    log_info "同步K8s配置文件..."
    
    local k8s_generated_dir="$PROJECT_ROOT/k8s/generated"
    
    if [[ ! -d "$k8s_generated_dir" ]]; then
        log_error "K8s配置目录不存在: $k8s_generated_dir"
        exit 1
    fi
    
    # 同步生成的配置文件
    if ! rsync -avz "$k8s_generated_dir/" \
        "$REMOTE_HOST:$REMOTE_PROJECT_DIR/k8s/generated/"; then
        log_error "K8s配置同步失败"
        exit 1
    fi
    
    log_success "K8s配置同步完成"
}

# 远程构建Docker镜像
build_images_remote() {
    log_info "在远程主机构建Docker镜像..."
    
    # 设置环境变量
    local env_vars="REGISTRY=$REGISTRY TAG=$TAG"
    
    # 执行远程构建
    if ! ssh "$REMOTE_HOST" "cd $REMOTE_PROJECT_DIR && $env_vars ./scripts/deploy/build-images-optimized.sh"; then
        log_error "远程Docker镜像构建失败"
        return 1
    fi
    
    log_success "Docker镜像构建完成"
}

# 更新K8s配置中的镜像标签
update_image_tags() {
    log_info "更新K8s配置中的镜像标签..."
    
    local services_file="$PROJECT_ROOT/k8s/generated/sre-copilot-services.yaml"
    
    if [[ ! -f "$services_file" ]]; then
        log_error "服务配置文件不存在: $services_file"
        exit 1
    fi
    
    # 更新镜像标签
    sed -i.bak \
        -e "s|__WECOM_IMAGE__|$REGISTRY/sre-copilot-wecom:$TAG|g" \
        -e "s|__API_IMAGE__|$REGISTRY/sre-copilot-api:$TAG|g" \
        -e "s|__MCP_IMAGE__|$REGISTRY/sre-copilot-mcp:$TAG|g" \
        "$services_file"
    
    log_success "镜像标签更新完成"
}

# 部署到K8s
deploy_to_k8s() {
    log_info "部署到Kubernetes集群..."
    
    # 同步更新后的配置
    sync_k8s_configs
    
    # 执行远程部署
    if ! ssh "$REMOTE_HOST" "cd $REMOTE_PROJECT_DIR/k8s/generated && ./deploy.sh"; then
        log_error "Kubernetes部署失败"
        return 1
    fi
    
    log_success "Kubernetes部署完成"
}

# 验证部署状态
verify_deployment() {
    log_info "验证部署状态..."
    
    # 等待服务就绪
    log_info "等待服务启动..."
    sleep 30
    
    # 检查Pod状态
    log_info "检查Pod状态..."
    ssh "$REMOTE_HOST" "kubectl get pods -n sre-copilot"
    
    # 检查服务状态
    log_info "检查服务状态..."
    ssh "$REMOTE_HOST" "kubectl get services -n sre-copilot"
    
    # 检查PostgreSQL连接
    log_info "验证PostgreSQL连接..."
    if ssh "$REMOTE_HOST" "kubectl exec -n sre-copilot deployment/postgresql -- psql -U postgres -d sre_copilot -c 'SELECT version();'" >/dev/null 2>&1; then
        log_success "PostgreSQL连接正常"
    else
        log_warning "PostgreSQL连接验证失败"
    fi
    
    # 检查服务健康状态
    log_info "检查服务健康状态..."
    local services=("wecom-server" "backend-api")
    
    for service in "${services[@]}"; do
        if ssh "$REMOTE_HOST" "kubectl get pods -n sre-copilot -l app=$service -o jsonpath='{.items[0].status.phase}'" | grep -q "Running"; then
            log_success "$service 服务运行正常"
        else
            log_warning "$service 服务状态异常"
        fi
    done
    
    log_success "部署验证完成"
}

# 显示部署信息
show_deployment_info() {
    log_info "部署信息汇总:"
    echo
    echo "🏷️  镜像标签: $TAG"
    echo "🏠 远程主机: $REMOTE_HOST"
    echo "📁 项目目录: $REMOTE_PROJECT_DIR"
    echo "🐳 镜像仓库: $REGISTRY"
    echo
    echo "📋 部署的服务:"
    echo "  - PostgreSQL (数据库)"
    echo "  - WeChat Bot (企微机器人)"
    echo "  - Backend API (后端API)"
    echo "  - MCP Server (MCP服务器)"
    echo
    echo "🔍 查看服务状态:"
    echo "  ssh $REMOTE_HOST 'kubectl get pods -n sre-copilot'"
    echo
    echo "📝 查看服务日志:"
    echo "  ssh $REMOTE_HOST 'kubectl logs -n sre-copilot deployment/wecom-server'"
    echo "  ssh $REMOTE_HOST 'kubectl logs -n sre-copilot deployment/backend-api'"
    echo "  ssh $REMOTE_HOST 'kubectl logs -n sre-copilot deployment/mcp-server'"
}

# 清理函数
cleanup() {
    log_info "清理临时文件..."
    
    # 清理备份文件
    find "$PROJECT_ROOT" -name "*.bak" -delete 2>/dev/null || true
    
    log_success "清理完成"
}

# 错误处理
handle_error() {
    local exit_code=$?
    log_error "部署过程中发生错误 (退出码: $exit_code)"
    cleanup
    exit $exit_code
}

# 主函数
main() {
    log_info "开始优化的远程部署流程..."
    
    # 设置错误处理
    trap handle_error ERR
    trap cleanup EXIT
    
    # 解析命令行参数
    local skip_build=false
    local skip_deploy=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                skip_build=true
                shift
                ;;
            --skip-deploy)
                skip_deploy=true
                shift
                ;;
            --tag)
                TAG="$2"
                shift 2
                ;;
            --help)
                echo "用法: $0 [选项]"
                echo "选项:"
                echo "  --skip-build    跳过Docker镜像构建"
                echo "  --skip-deploy   跳过K8s部署"
                echo "  --tag TAG       指定镜像标签"
                echo "  --help          显示此帮助信息"
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                exit 1
                ;;
        esac
    done
    
    # 执行部署流程
    check_ssh_connection
    generate_secure_configs
    update_image_tags
    sync_code_to_remote
    sync_k8s_configs
    
    if [[ "$skip_build" != true ]]; then
        build_images_remote
    fi
    
    if [[ "$skip_deploy" != true ]]; then
        deploy_to_k8s
        verify_deployment
    fi
    
    show_deployment_info
    
    log_success "优化的远程部署流程完成！"
}

# 执行主函数
main "$@"