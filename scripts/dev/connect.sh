#!/bin/bash
# 建立本地到远程的连接（端口转发）
# 让本地代码可以访问远程 K8s 中的服务

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 加载本地配置
CONFIG_FILE="$SCRIPT_DIR/config.local.sh"
if [ ! -f "$CONFIG_FILE" ]; then
    log_error "配置文件不存在: $CONFIG_FILE"
    exit 1
fi
source "$CONFIG_FILE"

# PID 文件
PID_FILE="$SCRIPT_DIR/.port-forward.pid"

# 函数：停止端口转发
stop_port_forward() {
    if [ -f "$PID_FILE" ]; then
        local pids=$(cat "$PID_FILE")
        for pid in $pids; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                log_info "已停止进程: $pid"
            fi
        done
        rm -f "$PID_FILE"
    fi
    
    # 清理可能残留的 SSH 进程
    pkill -f "ssh.*kubectl.*port-forward.*$NAMESPACE" 2>/dev/null || true
}

# 函数：启动端口转发
start_port_forward() {
    log_info "建立 SSH 端口转发..."
    
    # 清理旧的连接
    stop_port_forward
    
    # PostgreSQL 端口转发 (5432)
    log_info "转发 PostgreSQL (5432)..."
    ssh -p "$DEV_PORT" -N -L 5432:localhost:5432 "$DEV_USER@$DEV_HOST" \
        -o "ExitOnForwardFailure=yes" \
        -o "ServerAliveInterval=30" \
        -o "ServerAliveCountMax=3" &
    PG_PID=$!
    echo "$PG_PID" > "$PID_FILE"
    
    sleep 2
    
    # 检查是否成功
    if ! kill -0 "$PG_PID" 2>/dev/null; then
        log_error "PostgreSQL 端口转发失败"
        cat "$PID_FILE" 2>/dev/null && rm -f "$PID_FILE"
        exit 1
    fi
    
    # 在远程启动 kubectl port-forward
    log_info "在远程启动 kubectl port-forward..."
    ssh -p "$DEV_PORT" "$DEV_USER@$DEV_HOST" "
        # 清理旧的 port-forward
        pkill -f 'kubectl port-forward.*$NAMESPACE' 2>/dev/null || true
        sleep 1
        
        # 启动新的 port-forward (后台运行)
        nohup kubectl port-forward -n $NAMESPACE svc/postgresql 5432:5432 \
            --address=127.0.0.1 > /tmp/pf-postgresql.log 2>&1 &
        
        echo 'kubectl port-forward 已启动'
    "
    
    log_info "✅ 端口转发已建立"
    echo ""
    log_info "本地可访问："
    echo "  - PostgreSQL: localhost:5432"
    echo ""
    log_info "测试连接："
    echo "  psql -h localhost -U postgres -d team_memory"
    echo ""
    log_info "停止转发："
    echo "  ./scripts/dev/connect.sh stop"
}

# 函数：显示状态
show_status() {
    echo ""
    log_info "连接状态："
    
    if [ -f "$PID_FILE" ]; then
        local pids=$(cat "$PID_FILE")
        local active=0
        for pid in $pids; do
            if kill -0 "$pid" 2>/dev/null; then
                log_info "  进程 $pid: 运行中"
                active=$((active + 1))
            else
                log_warn "  进程 $pid: 已停止"
            fi
        done
        
        if [ $active -gt 0 ]; then
            echo ""
            log_info "端口占用："
            lsof -i :5432 2>/dev/null | head -5 || echo "  (无)"
        fi
    else
        log_warn "  无活动连接"
    fi
    
    echo ""
    log_info "远程 K8s 状态："
    ssh -p "$DEV_PORT" "$DEV_USER@$DEV_HOST" "
        kubectl get pods -n $NAMESPACE 2>/dev/null || echo '  无法获取状态'
    " 2>/dev/null || log_warn "  无法连接远程"
}

# 主逻辑
case "${1:-start}" in
    start)
        echo ""
        echo "=========================================="
        echo "🔗 SRE Copilot - 建立远程连接"
        echo "=========================================="
        start_port_forward
        ;;
    stop)
        echo ""
        log_info "停止端口转发..."
        stop_port_forward
        log_info "✅ 已停止"
        ;;
    restart)
        echo ""
        log_info "重启连接..."
        stop_port_forward
        sleep 1
        start_port_forward
        ;;
    status)
        show_status
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
