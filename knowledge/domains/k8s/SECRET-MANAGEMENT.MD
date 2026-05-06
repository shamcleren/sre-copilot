---
title: K8s Secret 管理指南
domain: k8s
role: admin
visibility: role
tags: [k8s, secret, security, deployment, troubleshooting]
author: shamcleren
created: 2026-02-07
updated: 2026-02-07
---

# K8s Secret 管理指南

> 企业级 K8s Secret 管理最佳实践

## 📋 问题背景

在 K8s 部署过程中，Secret 管理是最容易出问题的环节之一。常见问题包括：
- Secret 被覆盖为空值
- 敏感信息泄露到 Git
- 部署后配置丢失

---

## ⚠️ 常见问题：Secret 被覆盖

### 问题现象
部署后发现 Secret 中的所有值变为空（0 bytes），导致：
- 企微 Bot 无法响应
- 数据库连接失败
- API 调用失败

### 根本原因
```
部署流程问题：
本地 .env.secrets (❌ 不存在)
  → 脚本跳过上传
  → kubectl apply secret.yaml (空占位文件)
  → K8s Secret 被覆盖为空 ❌
```

### 解决方案

#### 1. 立即恢复（紧急）
```bash
# 从备份恢复
kubectl apply -f k8s-backup-*/secret-backup.yaml

# 重启服务
kubectl rollout restart deployment/sre-copilot-app -n sre-copilot

# 验证
kubectl describe secret sre-copilot-secret -n sre-copilot
```

#### 2. 创建本地配置（预防）
```bash
# 在项目根目录创建 .env.secrets
cat > .env.secrets << 'EOF'
WECOM_TOKEN=你的Token
WECOM_ENCODING_AES_KEY=你的密钥
BK_APP_SECRET=你的Secret
...
EOF

# 确保在 .gitignore 中
grep "\.env\.secrets" .gitignore
```

#### 3. 验证并部署
```bash
# 检查文件存在
ls -la .env.secrets

# 部署（会自动上传并合并到 K8s）
make deploy-fast
```

#### 4. 仅重建线上 Secret（不重新部署）
```bash
ssh dev 'cd /data/sre-copilot && bash scripts/deploy/rebuild-secret.sh'
ssh dev 'kubectl rollout restart deployment/sre-copilot-app -n sre-copilot'
```

---

## ✅ 最佳实践

### 1. Secret 文件管理

#### 本地文件（不提交到 Git）
```
.env.secrets           # 主配置文件
```

#### 远程文件（临时，用后即删）
```
secrets.env # 部署时临时创建
```

#### K8s 资源
```
sre-copilot-secret   # 生产环境 Secret
```

#### 备份文件
```
k8s-backup-{date}/secret-backup.yaml
```

### 2. 定期备份

```bash
# 每次重要配置变更后备份
mkdir -p k8s-backup-$(date +%Y%m%d)
kubectl get secret sre-copilot-secret -n sre-copilot -o yaml \
  > k8s-backup-$(date +%Y%m%d)/secret-backup.yaml
```

### 3. 部署前检查清单

- [ ] 本地存在 `.env.secrets` 文件
- [ ] 文件包含所有必要配置
- [ ] 文件在 `.gitignore` 中
- [ ] 有最新的 Secret 备份

### 4. 部署后验证

```bash
# 检查 Secret 值
kubectl describe secret sre-copilot-secret -n sre-copilot

# 查看 Pod 日志
kubectl logs -f deployment/sre-copilot-app -n sre-copilot

# 测试企微 Bot
# 在企微发送: help
```

---

## 🔐 安全注意事项

### 永远不要
- ❌ 不要提交 `.env.secrets` 到 Git
- ❌ 不要在日志中打印 Secret 值
- ❌ 不要在代码中硬编码 Secret
- ❌ 不要通过聊天工具分享 Secret

### 应该做
- ✅ 使用环境变量注入
- ✅ 定期轮换密钥
- ✅ 限制访问权限
- ✅ 定期备份配置

---

## 🛠️ 故障排查

### 症状：企微 Bot 无法响应

**检查步骤**：
```bash
# 1. 检查 Secret
kubectl get secret sre-copilot-secret -n sre-copilot -o yaml

# 2. 查看哪些字段为空
kubectl describe secret sre-copilot-secret -n sre-copilot

# 3. 检查 Pod 日志
kubectl logs deployment/sre-copilot-app -n sre-copilot | grep -i error

# 4. 查看配置检查接口
curl http://service-url/wechat/config-check
```

**如果 WECOM_TOKEN 或 WECOM_ENCODING_AES_KEY 为 0 bytes**：
→ 从备份恢复 Secret
→ 检查本地 `.env.secrets` 是否存在
→ 重新部署

---

## 📚 相关文档

- [Secret 配置管理](../../../docs/DOCS-INDEX.MD)
- [部署指南](../README.MD#部署)
- [企微 Bot 指南](../../../docs/wecom/WECOM-BOT-GUIDE.MD)

---

**领域**：k8s  
**角色要求**：admin  
**难度**：⭐⭐⭐  
**最后更新**：2026-02-07
