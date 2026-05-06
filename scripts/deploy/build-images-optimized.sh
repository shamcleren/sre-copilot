#!/bin/bash

# 优化的Docker镜像构建脚本
# 自动选择最优的Dockerfile，处理网络问题和构建超时

set -euo pipefail

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# 构建配置
BUILD_TIMEOUT=600  # 10分钟超时
DOCKER_BUILDKIT=1
export DOCKER_BUILDKIT

# 日志函数
log_info() {
    echo "🔨 [$(date '+%H:%M:%S')] $1"
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

# 检测网络连通性
check_network() {
    local mirror_url="$1"
    local timeout=5
    
    if curl -s --connect-timeout $timeout --max-time $timeout "$mirror_url" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 选择最优的Dockerfile
select_best_dockerfile() {
    local service="$1"
    local base_dockerfile="$BACKEND_DIR/Dockerfile.$service"
    local optimized_dockerfile="$BACKEND_DIR/Dockerfile.$service.optimized"
    
    # 检测网络状况
    local mirrors=(
        "https://mirrors.cloud.tencent.com/pypi/simple/"
        "https://pypi.douban.com/simple/"
        "https://mirrors.aliyun.com/pypi/simple/"
        "https://pypi.tuna.tsinghua.edu.cn/simple/"
    )
    
    local working_mirrors=0
    for mirror in "${mirrors[@]}"; do
        if check_network "$mirror"; then
            ((working_mirrors++))
        fi
    done
    
    log_info "检测到 $working_mirrors 个可用的PyPI镜像源"
    
    # 根据网络状况选择Dockerfile
    if [[ $working_mirrors -ge 2 ]]; then
        log_info "网络状况良好，使用优化版Dockerfile"
        echo "$optimized_dockerfile"
    else
        log_warning "网络状况不佳，使用简化版Dockerfile"
        echo "$base_dockerfile"
    fi
}

# 构建单个镜像
build_image() {
    local service="$1"
    local image_tag="$2"
    
    log_info "开始构建 $service 镜像..."
    
    # 选择最优的Dockerfile
    local dockerfile
    dockerfile=$(select_best_dockerfile "$service")
    
    if [[ ! -f "$dockerfile" ]]; then
        log_error "Dockerfile不存在: $dockerfile"
        return 1
    fi
    
    log_info "使用Dockerfile: $(basename "$dockerfile")"
    
    # 构建镜像，带超时控制
    local build_start=$(date +%s)
    
    if timeout $BUILD_TIMEOUT docker build \
        --file "$dockerfile" \
        --tag "$image_tag" \
        --progress=plain \
        --no-cache \
        "$BACKEND_DIR"; then
        
        local build_end=$(date +%s)
        local build_time=$((build_end - build_start))
        log_success "$service 镜像构建完成 (耗时: ${build_time}s)"
        return 0
    else
        local exit_code=$?
        log_error "$service 镜像构建失败 (退出码: $exit_code)"
        
        # 如果是超时，尝试使用简化版Dockerfile
        if [[ $exit_code -eq 124 ]] && [[ "$dockerfile" == *".optimized" ]]; then
            log_warning "构建超时，尝试使用简化版Dockerfile重新构建..."
            local simple_dockerfile="$BACKEND_DIR/Dockerfile.$service"
            
            if timeout $BUILD_TIMEOUT docker build \
                --file "$simple_dockerfile" \
                --tag "$image_tag" \
                --progress=plain \
                --no-cache \
                "$BACKEND_DIR"; then
                
                log_success "$service 镜像构建完成 (使用简化版)"
                return 0
            fi
        fi
        
        return 1
    fi
}

# 清理Docker缓存
cleanup_docker_cache() {
    log_info "清理Docker构建缓存..."
    docker builder prune -f >/dev/null 2>&1 || true
    docker system prune -f >/dev/null 2>&1 || true
    log_success "Docker缓存清理完成"
}

# 检查Docker状态
check_docker() {
    log_info "检查Docker状态..."
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker未运行或无法访问"
        exit 1
    fi
    
    # 检查磁盘空间
    local available_space
    available_space=$(df /var/lib/docker 2>/dev/null | awk 'NR==2 {print $4}' || echo "0")
    local min_space=2097152  # 2GB in KB
    
    if [[ $available_space -lt $min_space ]]; then
        log_warning "Docker存储空间不足，尝试清理..."
        cleanup_docker_cache
    fi
    
    log_success "Docker状态检查完成"
}

# 构建所有镜像
build_all_images() {
    local services=("wecom" "api" "mcp")
    local registry="${REGISTRY:-localhost:5000}"
    local tag="${TAG:-latest}"
    
    log_info "开始构建所有服务镜像..."
    log_info "镜像仓库: $registry"
    log_info "镜像标签: $tag"
    
    local failed_services=()
    local successful_services=()
    
    for service in "${services[@]}"; do
        local image_tag="$registry/sre-copilot-$service:$tag"
        
        if build_image "$service" "$image_tag"; then
            successful_services+=("$service")
        else
            failed_services+=("$service")
        fi
        
        echo  # 空行分隔
    done
    
    # 构建结果汇总
    log_info "构建结果汇总:"
    
    if [[ ${#successful_services[@]} -gt 0 ]]; then
        log_success "成功构建的服务: ${successful_services[*]}"
    fi
    
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_error "构建失败的服务: ${failed_services[*]}"
        return 1
    fi
    
    log_success "所有镜像构建完成！"
}

# 显示镜像信息
show_images() {
    log_info "构建的镜像列表:"
    docker images | grep "sre-copilot" || log_warning "未找到sre-copilot相关镜像"
}

# 主函数
main() {
    log_info "开始优化的Docker镜像构建流程..."
    
    # 解析命令行参数
    local service=""
    local clean=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --service)
                service="$2"
                shift 2
                ;;
            --clean)
                clean=true
                shift
                ;;
            --help)
                echo "用法: $0 [选项]"
                echo "选项:"
                echo "  --service SERVICE  只构建指定服务 (wecom|api|mcp)"
                echo "  --clean           构建前清理Docker缓存"
                echo "  --help            显示此帮助信息"
                echo
                echo "环境变量:"
                echo "  REGISTRY          镜像仓库地址 (默认: localhost:5000)"
                echo "  TAG              镜像标签 (默认: latest)"
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                exit 1
                ;;
        esac
    done
    
    check_docker
    
    if [[ "$clean" == true ]]; then
        cleanup_docker_cache
    fi
    
    if [[ -n "$service" ]]; then
        # 构建单个服务
        local registry="${REGISTRY:-localhost:5000}"
        local tag="${TAG:-latest}"
        local image_tag="$registry/sre-copilot-$service:$tag"
        
        build_image "$service" "$image_tag"
    else
        # 构建所有服务
        build_all_images
    fi
    
    show_images
    
    log_success "Docker镜像构建流程完成！"
}

# 执行主函数
main "$@"