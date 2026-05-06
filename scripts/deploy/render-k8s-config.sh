#!/bin/bash

# K8s配置安全渲染脚本
# 从.env.secrets读取敏感信息，渲染到k8s配置文件
# 确保敏感信息不会泄露到git仓库

set -euo pipefail

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_FILE="$PROJECT_ROOT/.env.secrets"
K8S_DIR="$PROJECT_ROOT/k8s"
TEMPLATES_DIR="$K8S_DIR/templates"
OUTPUT_DIR="$K8S_DIR/generated"

# 日志函数
log_info() {
    echo "🔧 [$(date '+%H:%M:%S')] $1"
}

log_error() {
    echo "❌ [$(date '+%H:%M:%S')] $1" >&2
}

log_success() {
    echo "✅ [$(date '+%H:%M:%S')] $1"
}

# 检查必要文件
check_prerequisites() {
    log_info "检查前置条件..."
    
    if [[ ! -f "$SECRETS_FILE" ]]; then
        log_error "未找到敏感配置文件: $SECRETS_FILE"
        exit 1
    fi
    
    # 创建输出目录
    mkdir -p "$OUTPUT_DIR"
    mkdir -p "$TEMPLATES_DIR"
    
    log_success "前置条件检查完成"
}

# 加载环境变量
load_secrets() {
    log_info "加载敏感配置..."
    
    # 加载.env.secrets文件
    set -a  # 自动导出变量
    source "$SECRETS_FILE"
    set +a
    
    # 验证必要的环境变量
    local required_vars=(
        "POSTGRES_PASSWORD"
        "MCP_API_KEY"
        "WECOM_TOKEN"
        "WECOM_ENCODING_AES_KEY"
        "BK_APP_SECRET"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "缺少必要的环境变量: $var"
            exit 1
        fi
    done
    
    log_success "敏感配置加载完成"
}

# 生成Secret配置
generate_secret() {
    log_info "生成Kubernetes Secret配置..."
    
    local secret_file="$OUTPUT_DIR/sre-copilot-secret.yaml"
    
    cat > "$secret_file" << EOF
# 自动生成的安全Secret配置
# 生成时间: $(date)
# 警告：此文件包含敏感信息，不要提交到git！

apiVersion: v1
kind: Secret
metadata:
  name: sre-copilot-secret
  namespace: sre-copilot
type: Opaque
stringData:
  # 数据库密码 (强密码)
  POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
  
  # MCP API密钥
  MCP_API_KEY: "${MCP_API_KEY}"
  
  # 蓝鲸 AI 平台
  BK_APP_CODE: "ai-sre-copilot"
  BK_APP_SECRET: "${BK_APP_SECRET}"
  
  # 企业微信配置
  WECOM_TOKEN: "${WECOM_TOKEN}"
  WECOM_ENCODING_AES_KEY: "${WECOM_ENCODING_AES_KEY}"
  WECOM_CORP_ID: "${WECOM_CORP_ID:-PLEASE_SET_YOUR_CORP_ID}"
  WECOM_WEBHOOK_URL: "${WECOM_WEBHOOK_URL:-https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=PLEASE_SET_YOUR_WEBHOOK_KEY}"
  
  # 第三方API密钥 (可选)
  OPENAI_API_KEY: "${OPENAI_API_KEY:-PLEASE_SET_YOUR_OPENAI_API_KEY}"
  GEMINI_API_KEY: "${GEMINI_API_KEY:-PLEASE_SET_YOUR_GEMINI_API_KEY}"
  GOOGLE_API_KEY: "${GOOGLE_API_KEY:-PLEASE_SET_YOUR_GOOGLE_API_KEY}"
EOF

    log_success "Secret配置生成完成: $secret_file"
}

# 渲染服务配置模板
render_service_templates() {
    log_info "渲染服务配置模板..."
    
    # 复制基础模板到生成目录
    if [[ -f "$K8S_DIR/mvp/sre-copilot-services.yaml" ]]; then
        cp "$K8S_DIR/mvp/sre-copilot-services.yaml" "$OUTPUT_DIR/sre-copilot-services.yaml"
        log_success "服务配置模板复制完成"
    fi
    
    # 复制PostgreSQL配置
    if [[ -f "$K8S_DIR/mvp/postgresql-simple.yaml" ]]; then
        cp "$K8S_DIR/mvp/postgresql-simple.yaml" "$OUTPUT_DIR/postgresql.yaml"
        log_success "PostgreSQL配置复制完成"
    fi
}

# 生成部署脚本
generate_deploy_script() {
    log_info "生成部署脚本..."
    
    local deploy_script="$OUTPUT_DIR/deploy.sh"
    
    cat > "$deploy_script" << 'EOF'
#!/bin/bash

# 自动生成的K8s部署脚本
# 使用此脚本部署所有服务到Kubernetes集群

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log_info() {
    echo "🚀 [$(date '+%H:%M:%S')] $1"
}

log_error() {
    echo "❌ [$(date '+%H:%M:%S')] $1" >&2
}

log_success() {
    echo "✅ [$(date '+%H:%M:%S')] $1"
}

# 检查kubectl连接
check_kubectl() {
    log_info "检查Kubernetes连接..."
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "无法连接到Kubernetes集群"
        exit 1
    fi
    log_success "Kubernetes连接正常"
}

# 创建命名空间
create_namespace() {
    log_info "创建命名空间..."
    kubectl create namespace sre-copilot --dry-run=client -o yaml | kubectl apply -f -
    log_success "命名空间创建完成"
}

# 部署Secret
deploy_secret() {
    log_info "部署Secret配置..."
    kubectl apply -f "$SCRIPT_DIR/sre-copilot-secret.yaml"
    log_success "Secret部署完成"
}

# 部署PostgreSQL
deploy_postgresql() {
    log_info "部署PostgreSQL..."
    kubectl apply -f "$SCRIPT_DIR/postgresql.yaml"
    log_success "PostgreSQL部署完成"
}

# 部署应用服务
deploy_services() {
    log_info "部署应用服务..."
    kubectl apply -f "$SCRIPT_DIR/sre-copilot-services.yaml"
    log_success "应用服务部署完成"
}

# 等待服务就绪
wait_for_services() {
    log_info "等待服务就绪..."
    
    # 等待PostgreSQL就绪
    kubectl wait --for=condition=ready pod -l app=postgresql -n sre-copilot --timeout=300s
    
    # 等待应用服务就绪
    kubectl wait --for=condition=ready pod -l service=wecom -n sre-copilot --timeout=300s || true
    kubectl wait --for=condition=ready pod -l service=api -n sre-copilot --timeout=300s || true
    kubectl wait --for=condition=ready pod -l service=mcp -n sre-copilot --timeout=300s || true
    
    log_success "服务就绪检查完成"
}

# 显示服务状态
show_status() {
    log_info "显示服务状态..."
    echo
    echo "=== Pods 状态 ==="
    kubectl get pods -n sre-copilot
    echo
    echo "=== Services 状态 ==="
    kubectl get services -n sre-copilot
    echo
}

# 主函数
main() {
    log_info "开始部署SRE Copilot服务..."
    
    check_kubectl
    create_namespace
    deploy_secret
    deploy_postgresql
    deploy_services
    wait_for_services
    show_status
    
    log_success "SRE Copilot服务部署完成！"
}

# 执行主函数
main "$@"
EOF

    chmod +x "$deploy_script"
    log_success "部署脚本生成完成: $deploy_script"
}

# 生成.gitignore规则
update_gitignore() {
    log_info "更新.gitignore规则..."
    
    local gitignore_file="$PROJECT_ROOT/.gitignore"
    local gitignore_rules=(
        "# K8s生成的配置文件（包含敏感信息）"
        "k8s/generated/"
        "*.secret.yaml"
        "*-secret.yaml"
        "# 环境变量文件"
        ".env.secrets"
        ".env.local"
    )
    
    # 检查并添加gitignore规则
    for rule in "${gitignore_rules[@]}"; do
        if ! grep -Fxq "$rule" "$gitignore_file" 2>/dev/null; then
            echo "$rule" >> "$gitignore_file"
        fi
    done
    
    log_success ".gitignore规则更新完成"
}

# 主函数
main() {
    log_info "开始K8s配置安全渲染..."
    
    check_prerequisites
    load_secrets
    generate_secret
    render_service_templates
    generate_deploy_script
    update_gitignore
    
    log_success "K8s配置安全渲染完成！"
    echo
    echo "生成的文件："
    echo "  - $OUTPUT_DIR/sre-copilot-secret.yaml"
    echo "  - $OUTPUT_DIR/sre-copilot-services.yaml"
    echo "  - $OUTPUT_DIR/postgresql.yaml"
    echo "  - $OUTPUT_DIR/deploy.sh"
    echo
    echo "使用方法："
    echo "  cd $OUTPUT_DIR && ./deploy.sh"
}

# 执行主函数
main "$@"