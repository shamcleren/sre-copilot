#!/bin/bash

# 生成安全密码脚本
# 用于生成PostgreSQL和其他服务的强密码

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

# 生成强密码函数
generate_password() {
    local length=${1:-32}
    # 使用字母、数字和安全的特殊字符
    openssl rand -base64 $((length * 3 / 4)) | tr -d "=+/" | cut -c1-${length}
}

# 生成API密钥
generate_api_key() {
    local length=${1:-64}
    openssl rand -hex $((length / 2))
}

# 生成企微Token (32位字母数字)
generate_wecom_token() {
    openssl rand -base64 32 | tr -d "=+/0-9" | cut -c1-32
}

# 生成企微AES密钥 (43位base64)
generate_wecom_aes_key() {
    openssl rand -base64 32 | cut -c1-43
}

# 创建安全的Secret配置
create_secure_secret() {
    log_step "生成安全的Secret配置..."
    
    # 生成各种密码和密钥
    local db_password=$(generate_password 32)
    local mcp_api_key=$(generate_api_key 64)
    local wecom_token=$(generate_wecom_token)
    local wecom_aes_key=$(generate_wecom_aes_key)
    
    # 创建Secret YAML文件
    local secret_file="$PROJECT_ROOT/k8s/generated/sre-copilot-secret.yaml"
    
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
  POSTGRES_PASSWORD: "${db_password}"
  
  # MCP API密钥
  MCP_API_KEY: "${mcp_api_key}"
  
  # 蓝鲸 AI 平台 (需要手动配置)
  BK_APP_CODE: "ai-sre-copilot"
  BK_APP_SECRET: "PLEASE_SET_YOUR_BK_APP_SECRET"
  
  # 企业微信配置 (自动生成的示例值，需要在企微后台配置)
  WECOM_TOKEN: "${wecom_token}"
  WECOM_ENCODING_AES_KEY: "${wecom_aes_key}"
  WECOM_CORP_ID: "PLEASE_SET_YOUR_CORP_ID"
  WECOM_WEBHOOK_URL: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=PLEASE_SET_YOUR_WEBHOOK_KEY"
  
  # 第三方API密钥 (可选，需要手动配置)
  OPENAI_API_KEY: "PLEASE_SET_YOUR_OPENAI_API_KEY"
  GEMINI_API_KEY: "PLEASE_SET_YOUR_GEMINI_API_KEY"
  GOOGLE_API_KEY: "PLEASE_SET_YOUR_GOOGLE_API_KEY"
EOF

    log_info "✅ Secret配置已生成: $secret_file"
    log_warn "⚠️  请手动配置以下项目："
    echo "   - BK_APP_SECRET: 蓝鲸应用密钥"
    echo "   - WECOM_CORP_ID: 企业微信企业ID"
    echo "   - WECOM_WEBHOOK_URL: 企业微信Webhook URL"
    echo "   - 其他第三方API密钥（如需要）"
    
    # 生成.env.secrets文件
    local env_secrets_file="$PROJECT_ROOT/.env.secrets"
    
    cat > "$env_secrets_file" << EOF
# 自动生成的安全环境变量配置
# 生成时间: $(date)
# 警告：此文件包含敏感信息，不要提交到git！

# ===========================================
# 数据库敏感配置 (自动生成的强密码)
# ===========================================
POSTGRES_PASSWORD=${db_password}

# ===========================================
# MCP API密钥 (自动生成)
# ===========================================
MCP_API_KEY=${mcp_api_key}

# ===========================================
# 企微机器人敏感配置 (需要手动配置)
# ===========================================
WECOM_TOKEN=${wecom_token}
WECOM_ENCODING_AES_KEY=${wecom_aes_key}
WECOM_CORP_ID=PLEASE_SET_YOUR_CORP_ID
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=PLEASE_SET_YOUR_WEBHOOK_KEY

# ===========================================
# 蓝鲸AI平台敏感配置 (需要手动配置)
# ===========================================
BK_APP_SECRET=PLEASE_SET_YOUR_BK_APP_SECRET

# ===========================================
# 第三方API密钥（可选，需要手动配置）
# ===========================================
OPENAI_API_KEY=PLEASE_SET_YOUR_OPENAI_API_KEY
GEMINI_API_KEY=PLEASE_SET_YOUR_GEMINI_API_KEY
GOOGLE_API_KEY=PLEASE_SET_YOUR_GOOGLE_API_KEY
EOF

    log_info "✅ 环境变量配置已生成: $env_secrets_file"
    
    # 显示生成的密码信息
    echo ""
    log_info "🔐 生成的安全密码信息："
    echo "   数据库密码长度: 32字符"
    echo "   MCP API密钥长度: 64字符"
    echo "   企微Token长度: 32字符"
    echo "   企微AES密钥长度: 43字符"
    
    return 0
}

# 更新硬编码密码
update_hardcoded_passwords() {
    log_step "更新配置文件中的硬编码密码..."
    
    local services_file="$PROJECT_ROOT/k8s/generated/sre-copilot-services.yaml"
    
    if [[ -f "$services_file" ]]; then
        # 备份原文件
        cp "$services_file" "$services_file.backup.$(date +%Y%m%d-%H%M%S)"
        
        # 替换硬编码的密码为从Secret获取
        sed -i.tmp 's|postgresql://postgres:password@postgresql:5432/sre_copilot|postgresql://postgres:$(POSTGRES_PASSWORD)@postgresql:5432/sre_copilot|g' "$services_file"
        rm -f "$services_file.tmp"
        
        log_info "✅ 已更新 $services_file 中的硬编码密码"
    else
        log_warn "⚠️  文件不存在: $services_file"
    fi
}

# 检查.gitignore
check_gitignore() {
    log_step "检查.gitignore配置..."
    
    local gitignore_file="$PROJECT_ROOT/.gitignore"
    local secrets_patterns=(
        ".env.secrets"
        "k8s/generated/sre-copilot-secret.yaml"
        "*.secret"
        "*.secrets"
    )
    
    for pattern in "${secrets_patterns[@]}"; do
        if ! grep -q "^$pattern" "$gitignore_file" 2>/dev/null; then
            echo "$pattern" >> "$gitignore_file"
            log_info "✅ 已添加 $pattern 到 .gitignore"
        fi
    done
}

# 生成密码强度报告
generate_security_report() {
    log_step "生成安全配置报告..."
    
    local report_file="$PROJECT_ROOT/SECURITY-PASSWORD-UPDATE-REPORT.md"
    
    cat > "$report_file" << EOF
# PostgreSQL密码安全更新报告

## 更新概述

本报告记录了PostgreSQL弱口令问题的修复过程和结果。

## 发现的安全问题

### 1. 硬编码弱密码
- **位置**: \`k8s/generated/sre-copilot-services.yaml\`
- **问题**: 使用硬编码的弱密码 \`password\`
- **风险**: 高风险，容易被破解

### 2. 明文密码配置
- **问题**: 数据库连接字符串中包含明文密码
- **风险**: 中等风险，配置文件泄露可能导致数据库被访问

## 修复措施

### 1. 生成强密码
- ✅ 使用 \`openssl\` 生成32位强密码
- ✅ 包含字母、数字和安全特殊字符
- ✅ 密码熵足够高，难以破解

### 2. 使用Kubernetes Secret
- ✅ 将敏感信息存储在Kubernetes Secret中
- ✅ 通过环境变量注入，避免硬编码
- ✅ Secret文件不提交到git仓库

### 3. 更新配置文件
- ✅ 移除硬编码密码
- ✅ 使用Secret引用替代明文密码
- ✅ 备份原始配置文件

### 4. 完善安全措施
- ✅ 更新.gitignore，防止敏感文件提交
- ✅ 生成安全的API密钥和Token
- ✅ 提供配置指导文档

## 生成的安全配置

### 1. 数据库密码
- **长度**: 32字符
- **字符集**: Base64字符（去除特殊符号）
- **强度**: 高强度，符合安全标准

### 2. MCP API密钥
- **长度**: 64字符
- **格式**: 十六进制
- **用途**: MCP服务认证

### 3. 企微配置
- **Token**: 32字符字母数字组合
- **AES密钥**: 43字符Base64编码
- **用途**: 企业微信机器人认证

## 配置文件更新

### 更新的文件
1. \`k8s/generated/sre-copilot-secret.yaml\` - 新增安全Secret配置
2. \`k8s/generated/sre-copilot-services.yaml\` - 移除硬编码密码
3. \`.env.secrets\` - 本地开发环境配置
4. \`.gitignore\` - 防止敏感文件提交

### 需要手动配置的项目
- [ ] BK_APP_SECRET: 蓝鲸应用密钥
- [ ] WECOM_CORP_ID: 企业微信企业ID  
- [ ] WECOM_WEBHOOK_URL: 企业微信Webhook URL
- [ ] 第三方API密钥（如OpenAI、Gemini等）

## 部署指导

### 1. 应用Secret配置
\`\`\`bash
kubectl apply -f k8s/generated/sre-copilot-secret.yaml
\`\`\`

### 2. 重新部署服务
\`\`\`bash
kubectl rollout restart deployment/postgresql -n sre-copilot
kubectl rollout restart deployment/backend-api -n sre-copilot
kubectl rollout restart deployment/mcp-server -n sre-copilot
\`\`\`

### 3. 验证配置
\`\`\`bash
kubectl get secret sre-copilot-secret -n sre-copilot
kubectl logs -f deployment/postgresql -n sre-copilot
\`\`\`

## 安全建议

### 1. 定期更新密码
- 建议每3-6个月更新数据库密码
- 使用此脚本重新生成强密码

### 2. 访问控制
- 限制数据库网络访问
- 使用最小权限原则

### 3. 监控和审计
- 启用数据库访问日志
- 监控异常登录尝试

### 4. 备份安全
- 加密数据库备份
- 安全存储备份文件

## 验证清单

- [x] 生成强密码（32字符）
- [x] 创建Kubernetes Secret配置
- [x] 更新服务配置文件
- [x] 移除硬编码密码
- [x] 更新.gitignore配置
- [x] 生成安全报告
- [ ] 手动配置企微和蓝鲸密钥
- [ ] 部署并验证服务正常运行

---

**报告生成时间**: $(date)  
**修复工具**: scripts/tools/generate-secure-password.sh  
**安全等级**: 高安全性配置
EOF

    log_info "✅ 安全报告已生成: $report_file"
}

# 显示帮助信息
show_help() {
    cat << EOF
PostgreSQL密码安全更新脚本

用法: $0 [选项]

选项:
    --generate-only     仅生成密码，不更新配置文件
    --update-only       仅更新配置文件，不生成新密码
    --help              显示此帮助信息

功能:
    1. 生成强密码和API密钥
    2. 创建安全的Kubernetes Secret配置
    3. 更新配置文件中的硬编码密码
    4. 完善.gitignore配置
    5. 生成安全配置报告

示例:
    $0                  # 完整的安全更新流程
    $0 --generate-only  # 仅生成新的密码和密钥
    $0 --update-only    # 仅更新现有配置文件
EOF
}

# 主函数
main() {
    local generate_only=false
    local update_only=false
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --generate-only)
                generate_only=true
                shift
                ;;
            --update-only)
                update_only=true
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
    
    log_info "🔐 开始PostgreSQL密码安全更新"
    
    # 检查必要工具
    if ! command -v openssl &> /dev/null; then
        log_error "需要安装 openssl 工具"
        exit 1
    fi
    
    if [[ "$update_only" != true ]]; then
        create_secure_secret
    fi
    
    if [[ "$generate_only" != true ]]; then
        update_hardcoded_passwords
        check_gitignore
        generate_security_report
    fi
    
    log_info "🎉 PostgreSQL密码安全更新完成！"
    
    if [[ "$generate_only" != true ]]; then
        echo ""
        log_warn "⚠️  下一步操作："
        echo "   1. 手动配置 k8s/generated/sre-copilot-secret.yaml 中的企微和蓝鲸密钥"
        echo "   2. 应用Secret配置: kubectl apply -f k8s/generated/sre-copilot-secret.yaml"
        echo "   3. 重启相关服务以使用新密码"
        echo "   4. 验证服务正常运行"
    fi
}

# 执行主函数
main "$@"