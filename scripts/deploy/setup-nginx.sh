#!/bin/bash
# 配置 Nginx 反向代理
# 将 sre-copilot.example.com 代理到 K8s NodePort

set -e

DOMAIN="sre-copilot.example.com"
BACKEND_PORT="30800"  # K8s NodePort

echo "=============================================="
echo "🔧 配置 Nginx 反向代理"
echo "=============================================="
echo ""
echo "域名: $DOMAIN"
echo "后端: 127.0.0.1:$BACKEND_PORT"
echo ""

# 检查 nginx
if ! command -v nginx &>/dev/null; then
    echo "安装 Nginx..."
    apt-get update && apt-get install -y nginx
fi

# 创建 nginx 配置
cat > /etc/nginx/conf.d/sre-copilot.conf << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    # 企业微信回调
    location /wechat/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/wechat/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # 超时设置（AI 响应可能较慢）
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # API 接口
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # Web 界面
    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

echo "✅ Nginx 配置已创建: /etc/nginx/conf.d/sre-copilot.conf"

# 测试配置
echo ""
echo "测试 Nginx 配置..."
nginx -t

# 重载 nginx
echo ""
echo "重载 Nginx..."
systemctl reload nginx || nginx -s reload

echo ""
echo "=============================================="
echo "✅ Nginx 反向代理配置完成"
echo "=============================================="
echo ""
echo "企业微信回调 URL:"
echo "  http://${DOMAIN}/wechat/callback"
echo ""
echo "健康检查:"
echo "  http://${DOMAIN}/"
echo "  http://${DOMAIN}/wechat/health"
echo ""
