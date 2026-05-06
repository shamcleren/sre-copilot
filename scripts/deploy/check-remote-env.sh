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
PROJECT_PATH="/data/sre-copilot"

echo "🔍 检查远程环境配置"
echo "===================="

# 检查SSH连接
log_info "检查SSH连接..."
if ssh -o ConnectTimeout=10 $REMOTE_HOST "echo 'SSH连接测试'" > /dev/null 2>&1; then
    log_success "SSH连接正常"
else
    log_error "SSH连接失败"
    echo "请检查以下配置:"
    echo "1. ~/.ssh/config 中是否配置了 'dev' 主机"
    echo "2. SSH密钥是否正确配置"
    echo "3. 远程服务器是否可访问"
    exit 1
fi

# 检查远程环境
log_info "检查远程服务器环境..."
ssh $REMOTE_HOST "PROJECT_PATH='$PROJECT_PATH' /bin/bash -s" << 'EOF'
    echo "🖥️  系统信息:"
    echo "  操作系统: $(uname -s)"
    echo "  内核版本: $(uname -r)"
    echo "  架构: $(uname -m)"
    echo "  主机名: $(hostname)"
    echo ""
    
    echo "💾 磁盘空间:"
    df -h | grep -E "(Filesystem|/scripts/)"
    echo ""
    
    echo "🧠 内存使用:"
    free -h
    echo ""
    
    echo "🐳 Docker状态:"
    if command -v docker &> /dev/null; then
        echo "  Docker版本: $(docker --version)"
        echo "  Docker状态: $(systemctl is-active docker 2>/dev/null || echo '未知')"
        echo "  Docker镜像数量: $(docker images | wc -l)"
        echo "  运行中容器: $(docker ps | wc -l)"
    else
        echo "  ❌ Docker未安装"
    fi
    echo ""
    
    echo "☸️  Kubernetes状态:"
    if command -v kubectl &> /dev/null; then
        echo "  kubectl版本: $(kubectl version --client --short 2>/dev/null)"
        echo "  集群连接: $(kubectl cluster-info --request-timeout=5s > /dev/null 2>&1 && echo '✅ 正常' || echo '❌ 失败')"
        echo "  当前上下文: $(kubectl config current-context 2>/dev/null || echo '未配置')"
        echo "  可用节点: $(kubectl get nodes --no-headers 2>/dev/null | wc -l || echo '0')"
    else
        echo "  ❌ kubectl未安装"
    fi
    echo ""
    
    echo "📁 项目目录:"
    if [ -d "$PROJECT_PATH" ]; then
        echo "  ✅ 项目目录存在: $PROJECT_PATH"
        cd "$PROJECT_PATH"
        echo "  Git状态: $(git status --porcelain | wc -l) 个未提交文件"
        echo "  当前分支: $(git branch --show-current 2>/dev/null || echo '未知')"
        echo "  最新提交: $(git log -1 --oneline 2>/dev/null || echo '无提交记录')"
    else
        echo "  ❌ 项目目录不存在: $PROJECT_PATH"
        echo "  建议执行: mkdir -p $PROJECT_PATH 并同步项目代码"
    fi
    echo ""
    
    echo "🔧 Git配置:"
    if command -v git &> /dev/null; then
        echo "  Git版本: $(git --version)"
        echo "  用户名: $(git config --global user.name 2>/dev/null || echo '未配置')"
        echo "  邮箱: $(git config --global user.email 2>/dev/null || echo '未配置')"
    else
        echo "  ❌ Git未安装"
    fi
    echo ""
    
    echo "🌐 网络连接:"
    echo "  外网连接: $(ping -c 1 8.8.8.8 > /dev/null 2>&1 && echo '✅ 正常' || echo '❌ 失败')"
    echo "  Docker Hub: $(ping -c 1 registry-1.docker.io > /dev/null 2>&1 && echo '✅ 可达' || echo '❌ 不可达')"
    echo ""
    
    echo "🔐 权限检查:"
    echo "  Docker权限: $(docker ps > /dev/null 2>&1 && echo '✅ 正常' || echo '❌ 需要sudo')"
    echo "  kubectl权限: $(kubectl get pods > /dev/null 2>&1 && echo '✅ 正常' || echo '❌ 无权限')"
    echo ""
    
    echo "📊 系统负载:"
    uptime
    echo ""
    
    echo "🔍 端口占用:"
    echo "  3001端口: $(netstat -ln | grep :3001 > /dev/null 2>&1 && echo '占用' || echo '空闲')"
    echo "  8080端口: $(netstat -ln | grep :8080 > /dev/null 2>&1 && echo '占用' || echo '空闲')"
EOF

log_success "远程环境检查完成"

echo ""
echo "📋 建议检查项:"
echo "1. 确保Docker服务正在运行"
echo "2. 确保kubectl可以连接到K8s集群"
echo "3. 确保项目目录存在且Git配置正确"
echo "4. 确保有足够的磁盘空间用于构建镜像"
echo "5. 确保网络连接正常，可以拉取依赖"

echo ""
echo "🚀 如果环境检查通过，可以执行部署:"
echo "   ./scripts/deploy/deploy-remote.sh"