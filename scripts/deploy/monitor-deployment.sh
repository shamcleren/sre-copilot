#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

REMOTE_HOST="dev"
NAMESPACE="sre-copilot"
APP_NAME="sre-copilot-app"

echo "📊 监控远程K8s部署状态"
echo "========================"

# 检查SSH连接
if ! ssh -o ConnectTimeout=5 $REMOTE_HOST "echo 'test'" > /dev/null 2>&1; then
    log_error "SSH连接失败"
    exit 1
fi

# 监控部署状态
ssh $REMOTE_HOST << EOF
    echo "🏷️  Namespace: $NAMESPACE"
    echo "📱 应用名称: $APP_NAME"
    echo ""
    
    echo "📊 Pod状态:"
    kubectl get pods -n $NAMESPACE -o wide
    echo ""
    
    echo "🌐 Service状态:"
    kubectl get svc -n $NAMESPACE
    echo ""
    
    echo "📈 Deployment状态:"
    kubectl get deployment -n $NAMESPACE
    echo ""
    
    echo "🔄 ReplicaSet状态:"
    kubectl get rs -n $NAMESPACE
    echo ""
    
    echo "📝 最近事件:"
    kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' | tail -10
    echo ""
    
    echo "🏥 健康检查:"
    POD_NAME=\$(kubectl get pods -n $NAMESPACE -l app=sre-copilot -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ ! -z "\$POD_NAME" ]; then
        echo "检查Pod: \$POD_NAME"
        kubectl exec \$POD_NAME -n $NAMESPACE -- curl -s localhost:3001/health 2>/dev/null | head -1 || echo "健康检查失败"
    else
        echo "未找到运行中的Pod"
    fi
    echo ""
    
    echo "📊 资源使用情况:"
    kubectl top pods -n $NAMESPACE 2>/dev/null || echo "metrics-server未安装，无法显示资源使用情况"
    echo ""
    
    echo "🔍 最新日志 (最近20行):"
    kubectl logs deployment/$APP_NAME -n $NAMESPACE --tail=20 2>/dev/null || echo "无法获取日志"
    echo ""
    
    echo "🔧 配置信息:"
    echo "ConfigMap:"
    kubectl get configmap -n $NAMESPACE
    echo ""
    echo "Secret:"
    kubectl get secret -n $NAMESPACE
    echo ""
    
    echo "🌍 Ingress状态:"
    kubectl get ingress -n $NAMESPACE 2>/dev/null || echo "未配置Ingress"
    echo ""
    
    echo "📋 部署历史:"
    kubectl rollout history deployment/$APP_NAME -n $NAMESPACE
EOF

echo ""
log_info "监控命令:"
echo "  • 实时日志: ssh $REMOTE_HOST 'kubectl logs -f deployment/$APP_NAME -n $NAMESPACE'"
echo "  • Pod详情: ssh $REMOTE_HOST 'kubectl describe pod <pod-name> -n $NAMESPACE'"
echo "  • 重启部署: ssh $REMOTE_HOST 'kubectl rollout restart deployment/$APP_NAME -n $NAMESPACE'"
echo "  • 扩缩容: ssh $REMOTE_HOST 'kubectl scale deployment/$APP_NAME --replicas=3 -n $NAMESPACE'"

echo ""
log_info "故障排除:"
echo "  • 查看事件: ssh $REMOTE_HOST 'kubectl get events -n $NAMESPACE --sort-by=.lastTimestamp'"
echo "  • 查看详情: ssh $REMOTE_HOST 'kubectl describe deployment/$APP_NAME -n $NAMESPACE'"
echo "  • 进入容器: ssh $REMOTE_HOST 'kubectl exec -it deployment/$APP_NAME -n $NAMESPACE -- /bin/sh'"