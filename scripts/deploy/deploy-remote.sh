#!/bin/bash
set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 配置变量
REMOTE_HOST="dev"
PROJECT_PATH="/data/sre-copilot"
NAMESPACE="sre-copilot"
APP_NAME="sre-copilot-app"
# 镜像必须使用腾讯云镜像仓库 registry.example.com/sre-copilot
REGISTRY="registry.example.com/sre-copilot"
IMAGE_NAME="sre-copilot"

# 解析参数
AUTO_YES=false
USE_RSYNC=false
for arg in "$@"; do
    case $arg in
        --yes|-y) AUTO_YES=true ;;
        --sync)   USE_RSYNC=true ;;
    esac
done

echo "🚀 开始远程K8s部署..."
echo "================================"

# 检查SSH连接
log_info "检查SSH连接..."
if ! ssh -o ConnectTimeout=10 $REMOTE_HOST "echo 'SSH连接正常'" > /dev/null 2>&1; then
    log_error "SSH连接失败，请检查配置"
    log_info "请确保 ~/.ssh/config 中配置了 dev 主机"
    exit 1
fi
log_success "SSH连接正常"

# 检查本地是否有未提交的更改
log_info "检查本地代码状态..."
if ! git diff --quiet || ! git diff --cached --quiet; then
    log_warning "检测到未提交的更改"
    if [[ "$AUTO_YES" != true ]]; then
        read -p "是否继续部署？(y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "部署已取消"
            exit 0
        fi
    else
        log_info "使用 --yes 跳过确认，继续部署"
    fi
fi

# 同步代码到远程：--sync 用 rsync 同步本地最新代码，避免依赖远程 git pull
LOCAL_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "$USE_RSYNC" == true ]]; then
    log_info "使用 rsync 同步本地最新代码到远程..."
    rsync -avz --delete \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='.env' \
        --exclude='.env.secrets' \
        --exclude='*.log' \
        "$LOCAL_PROJECT_ROOT/" "$REMOTE_HOST:$PROJECT_PATH/" || {
        log_error "rsync 同步失败"
        exit 1
    }
    log_success "代码同步完成"
    SKIP_GIT_PULL=true
else
    log_info "推送最新代码到远程仓库..."
    git push origin main || {
        log_error "代码推送失败"
        exit 1
    }
    log_success "代码推送完成"
    SKIP_GIT_PULL=false
fi

# 上传本地敏感配置到远端（不提交到 git，部署时显式传上去）
if [ -f "$LOCAL_PROJECT_ROOT/.env.secrets" ]; then
    log_info "上传 .env.secrets -> 远端 secrets.env（部署时合并到 K8s Secret）..."
    scp -q "$LOCAL_PROJECT_ROOT/.env.secrets" "$REMOTE_HOST:$PROJECT_PATH/secrets.env" || {
        log_error "上传 .env.secrets 失败"
        exit 1
    }
    log_success "已上传 .env.secrets"
fi
if [ -f "$LOCAL_PROJECT_ROOT/.env.admin-token" ]; then
    log_info "上传 .env.admin-token -> 远端项目根目录..."
    scp -q "$LOCAL_PROJECT_ROOT/.env.admin-token" "$REMOTE_HOST:$PROJECT_PATH/.env.admin-token" || {
        log_error "上传 .env.admin-token 失败"
        exit 1
    }
    log_success "已上传 .env.admin-token"
fi

# 生成版本号
VERSION=$(date +%Y%m%d-%H%M%S)
log_info "部署版本: $VERSION"
log_info "镜像仓库: $REGISTRY/${IMAGE_NAME}:$VERSION"

# 远程执行部署（构建 -> 打 tag 推送到 registry.example.com/sre-copilot -> 更新 K8s 并 apply）
log_info "连接远程服务器执行部署..."
ssh $REMOTE_HOST "export REGISTRY='$REGISTRY' IMAGE_NAME='$IMAGE_NAME' VERSION='$VERSION' PROJECT_PATH='$PROJECT_PATH' NAMESPACE='$NAMESPACE' APP_NAME='$APP_NAME' SKIP_GIT_PULL='$SKIP_GIT_PULL'; bash -s" << 'REMOTE_SCRIPT'
    set -e
    FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${VERSION}"

    echo "📁 切换到项目目录..."
    cd "$PROJECT_PATH" || { echo "❌ 项目目录不存在: $PROJECT_PATH"; exit 1; }

    if [[ "$SKIP_GIT_PULL" != true ]]; then
        echo "📥 拉取最新代码..."
        git pull origin main || { echo "❌ 代码拉取失败"; exit 1; }
    else
        echo "📂 使用已同步的代码（跳过 git pull）"
    fi

    echo "🔨 构建Docker镜像（仓库根 context）..."
    cd "$PROJECT_PATH"
    docker build -t ${IMAGE_NAME}:${VERSION} . || { echo "❌ Docker镜像构建失败"; exit 1; }

    echo "🏷️  标记并推送镜像到 $REGISTRY ..."
    docker tag ${IMAGE_NAME}:${VERSION} "$FULL_IMAGE" || { echo "❌ 镜像标记失败"; exit 1; }
    docker push "$FULL_IMAGE" || {
        echo "❌ 镜像推送失败，请确认已登录: docker login $REGISTRY"
        exit 1
    }

    echo "📝 更新K8s配置（使用 registry.example.com/sre-copilot 镜像）..."
    sed -i "s|image: .*|image: $FULL_IMAGE|g" k8s/deployment.yaml

    echo "🔎 检查 Kubernetes 连接..."
    if ! kubectl cluster-info > /dev/null 2>&1; then
        echo "❌ 无法连接 Kubernetes 集群（kubectl context 未配置或集群不可达）"
        echo "   请先在部署机配置 kubectl 上下文，再重试部署。"
        echo "   可检查: kubectl config get-contexts"
        exit 1
    fi

    echo "🚀 更新远端 Deployment 镜像..."
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    if ! kubectl get deployment/$APP_NAME -n $NAMESPACE >/dev/null 2>&1; then
        echo "❌ 未找到 deployment/$APP_NAME。当前仓库已不再携带完整 k8s/ 清单，请先在集群侧完成基础资源初始化。"
        exit 1
    fi
    kubectl patch deployment/$APP_NAME -n $NAMESPACE --type='json' -p="[{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/image\",\"value\":\"$FULL_IMAGE\"},{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/imagePullPolicy\",\"value\":\"Always\"}]" || {
        echo "❌ Deployment 镜像更新失败"
        exit 1
    }

    echo "🧹 清理已失败/已驱逐的 Pod，避免堆积..."
    kubectl delete pods -n $NAMESPACE --field-selector=status.phase=Failed 2>/dev/null || true
    kubectl get pods -n $NAMESPACE -o jsonpath='{range .items[?(@.status.reason=="Evicted")]}{.metadata.name}{"\n"}{end}' 2>/dev/null | xargs -r kubectl delete pod -n $NAMESPACE --force --grace-period=0 2>/dev/null || true

    # 与现有敏感信息同一管理：从 secrets.env 合并覆盖项到 Secret（该文件不提交、不随 rsync 覆盖）
    if [ -f secrets.env ]; then
      echo "📎 合并 secrets.env 覆盖项到 Secret..."
      set -a
      source secrets.env
      set +a
      _esc() { echo -n "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
      SECRET_PATCH=""
      PATCH_COUNT=0
      while IFS= read -r _line || [ -n "$_line" ]; do
        line="$(printf '%s' "$_line" | sed 's/\r$//')"
        case "$line" in
          ''|'#'*) continue ;;
        esac
        key="${line%%=*}"
        key="$(printf '%s' "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
          echo "⚠️  跳过无效变量名: $key"
          continue
        fi
        # 避免将本地开发连接串或本地数据库凭据带到远端（远端数据库口令需与持久化数据保持一致）
        if [ "$key" = "DATABASE_URL" ]; then
          echo "ℹ️  跳过 DATABASE_URL（防止覆盖远端数据库地址）"
          continue
        fi
        if [[ "$key" == POSTGRES_* ]]; then
          echo "ℹ️  跳过 $key（防止覆盖远端数据库凭据/连接配置）"
          continue
        fi
        value="${!key:-}"
        if [ -n "$value" ]; then
          SECRET_PATCH="${SECRET_PATCH}\"${key}\":\"$(_esc "$value")\","
          PATCH_COUNT=$((PATCH_COUNT + 1))
        fi
      done < secrets.env
      if [ -n "$SECRET_PATCH" ]; then
        SECRET_PATCH="${SECRET_PATCH%,}"
        kubectl patch secret sre-copilot-secret -n $NAMESPACE --type=merge -p "{\"stringData\":{${SECRET_PATCH}}}"
        echo "✅ Secret 已合并覆盖项（共 ${PATCH_COUNT} 项）"
        echo "🔄 重启 Deployment 以加载新 Secret..."
        kubectl rollout restart deployment/$APP_NAME -n $NAMESPACE
        rm -f secrets.env && echo "🧹 已删除远端临时 secrets.env"
      else
        echo "⚠️  secrets.env 中未发现非空覆盖变量，未执行 patch"
      fi
    else
      echo "⚠️  未找到 secrets.env（当前目录: $(pwd)），跳过 Secret 合并"
    fi

    echo "⏳ 等待部署就绪（最多 90 秒，不阻塞）..."
    if kubectl rollout status deployment/$APP_NAME -n $NAMESPACE --timeout=90s 2>/dev/null; then
        echo "✅ 部署已就绪"
    else
        echo "⚠️  未在 90 秒内就绪，不阻塞脚本；请稍后检查 Pod 与日志"
        kubectl get pods -n $NAMESPACE
        kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' | tail -15
    fi

    echo ""
    echo "🧹 再次清理失败/驱逐的 Pod..."
    kubectl delete pods -n $NAMESPACE --field-selector=status.phase=Failed 2>/dev/null || true
    kubectl get pods -n $NAMESPACE -o jsonpath='{range .items[?(@.status.reason=="Evicted")]}{.metadata.name}{"\n"}{end}' 2>/dev/null | xargs -r kubectl delete pod -n $NAMESPACE --force --grace-period=0 2>/dev/null || true

    echo "✅ 部署流程完成！"
    echo ""
    echo "📊 部署状态:"
    kubectl get pods -n $NAMESPACE -o wide
    echo ""
    kubectl get svc -n $NAMESPACE
    echo ""
    echo "🔍 健康检查..."
    sleep 10
    POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=sre-copilot --field-selector=status.phase=Running \
        -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null | tail -n 1 || true)
    if [ -n "$POD_NAME" ]; then
        echo "检查Pod: $POD_NAME"
        kubectl exec $POD_NAME -n $NAMESPACE -- node -e "fetch('http://127.0.0.1:3001/health').then(async (res) => { const text = await res.text(); process.stdout.write(text.split('\n')[0] || text); if (!res.ok) process.exit(1); }).catch((err) => { console.error(err.message || String(err)); process.exit(1); })" || {
            echo "⚠️  健康检查失败，查看日志:"
            kubectl logs $POD_NAME -n $NAMESPACE --tail=20
        }
    fi
    echo ""
    echo "🎉 部署版本 $VERSION 完成！镜像: $FULL_IMAGE"
    echo "📝 查看日志: kubectl logs -f deployment/$APP_NAME -n $NAMESPACE"
    echo "🌐 服务地址: kubectl get svc -n $NAMESPACE"
REMOTE_SCRIPT

if [ $? -eq 0 ]; then
    log_success "远程K8s部署完成！"
    echo ""
    echo "📋 后续操作:"
    echo "  • 查看实时日志: ssh $REMOTE_HOST 'kubectl logs -f deployment/$APP_NAME -n $NAMESPACE'"
    echo "  • 查看服务状态: ssh $REMOTE_HOST 'kubectl get all -n $NAMESPACE'"
    echo "  • 测试企微回调: curl 'http://service-url/wechat/callback?msg_signature=test&timestamp=1234567890&nonce=test&echostr=hello'"
    echo ""
    echo "🔄 如需回滚: ssh $REMOTE_HOST 'kubectl rollout undo deployment/$APP_NAME -n $NAMESPACE'"
else
    log_error "部署失败！"
    echo ""
    echo "🔍 故障排除:"
    echo "  • 查看Pod状态: ssh $REMOTE_HOST 'kubectl describe pods -n $NAMESPACE'"
    echo "  • 查看事件: ssh $REMOTE_HOST 'kubectl get events -n $NAMESPACE --sort-by=.lastTimestamp'"
    echo "  • 查看日志: ssh $REMOTE_HOST 'kubectl logs deployment/$APP_NAME -n $NAMESPACE'"
    exit 1
fi
