#!/bin/bash
# 🛑 停止 K8s 服务脚本
# 用途：停止 sre-copilot 的 K8s 部署
# 作者：SRE Copilot Team
# 日期：2026-02-08

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_success() { echo -e "${CYAN}✅${NC} $1"; }

NAMESPACE="sre-copilot"

# 显示横幅
show_banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║        🛑 停止 K8s 服务                                       ║"
    echo "║                                                              ║"
    echo "║        SRE Copilot - Kubernetes 服务管理                   ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

# 检查 kubectl
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl 未安装"
        echo ""
        echo "请安装 kubectl："
        echo "  - macOS: brew install kubectl"
        echo "  - Linux: https://kubernetes.io/docs/tasks/tools/"
        exit 1
    fi
    log_success "kubectl 已安装"
}

# 检查命名空间
check_namespace() {
    log_step "检查命名空间..."
    
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_warn "命名空间 $NAMESPACE 不存在"
        echo ""
        log_info "没有需要停止的服务"
        exit 0
    fi
    
    log_success "命名空间 $NAMESPACE 存在"
}

# 显示当前状态
show_current_status() {
    log_step "当前服务状态："
    echo ""
    
    echo "━━━ Deployments ━━━"
    kubectl get deployments -n "$NAMESPACE" 2>/dev/null || echo "无 Deployment"
    echo ""
    
    echo "━━━ Pods ━━━"
    kubectl get pods -n "$NAMESPACE" 2>/dev/null || echo "无 Pod"
    echo ""
    
    echo "━━━ Services ━━━"
    kubectl get services -n "$NAMESPACE" 2>/dev/null || echo "无 Service"
    echo ""
}

# 停止服务（缩容到 0）
scale_down() {
    log_step "缩容服务到 0 副本..."
    
    # 获取所有 Deployment
    deployments=$(kubectl get deployments -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
    
    if [ -z "$deployments" ]; then
        log_info "没有 Deployment 需要缩容"
        return 0
    fi
    
    for deployment in $deployments; do
        log_info "缩容 $deployment..."
        kubectl scale deployment "$deployment" --replicas=0 -n "$NAMESPACE" 2>/dev/null || true
    done
    
    # 等待 Pod 停止
    log_info "等待 Pod 停止..."
    sleep 3
    
    # 检查是否还有运行的 Pod
    running_pods=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Running -o name 2>/dev/null | wc -l)
    
    if [ "$running_pods" -eq 0 ]; then
        log_success "所有 Pod 已停止"
    else
        log_warn "仍有 $running_pods 个 Pod 正在运行"
        log_info "等待更长时间..."
        sleep 5
    fi
}

# 删除所有资源
delete_all() {
    log_step "删除所有资源..."
    
    echo ""
    log_warn "⚠️  这将删除命名空间中的所有资源（包括配置和数据）"
    read -p "确认删除？(yes/N) " -r
    echo
    
    if [[ ! $REPLY == "yes" ]]; then
        log_info "取消删除操作"
        return 0
    fi
    
    log_info "删除命名空间 $NAMESPACE..."
    kubectl delete namespace "$NAMESPACE" --timeout=60s 2>/dev/null || true
    
    log_success "命名空间已删除"
}

# 显示停止后状态
show_final_status() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_success "操作完成！"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        echo "📊 当前状态："
        echo ""
        kubectl get all -n "$NAMESPACE" 2>/dev/null || echo "命名空间为空"
        echo ""
        echo "💡 提示："
        echo "  - 服务已停止，但配置保留"
        echo "  - 重新启动：./scripts/deploy/deploy-remote.sh"
        echo "  - 完全删除：./scripts/dev/stop-k8s.sh --delete"
    else
        echo "✅ 所有资源已删除"
        echo ""
        echo "💡 提示："
        echo "  - 重新部署：./scripts/deploy/deploy-remote.sh"
    fi
    
    echo ""
}

# 主函数
main() {
    show_banner
    
    # 检查环境
    check_kubectl
    check_namespace
    
    # 显示当前状态
    show_current_status
    
    # 询问操作类型
    echo "请选择操作："
    echo "  1) 停止服务（缩容到 0，保留配置）"
    echo "  2) 删除所有资源（包括配置和数据）"
    echo "  3) 取消"
    echo ""
    read -p "请输入选项 (1-3): " -n 1 -r
    echo
    echo ""
    
    case $REPLY in
        1)
            scale_down
            ;;
        2)
            delete_all
            ;;
        3)
            log_info "操作已取消"
            exit 0
            ;;
        *)
            log_error "无效选项"
            exit 1
            ;;
    esac
    
    # 显示最终状态
    show_final_status
}

# 处理命令行参数
if [ "$1" == "--delete" ]; then
    show_banner
    check_kubectl
    check_namespace
    delete_all
    show_final_status
    exit 0
fi

if [ "$1" == "--scale-down" ]; then
    show_banner
    check_kubectl
    check_namespace
    scale_down
    show_final_status
    exit 0
fi

if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    show_banner
    echo "用法："
    echo "  ./scripts/dev/stop-k8s.sh              # 交互式选择操作"
    echo "  ./scripts/dev/stop-k8s.sh --scale-down # 直接缩容到 0"
    echo "  ./scripts/dev/stop-k8s.sh --delete     # 直接删除所有资源"
    echo "  ./scripts/dev/stop-k8s.sh --help       # 显示帮助"
    echo ""
    exit 0
fi

# 运行主函数
main
