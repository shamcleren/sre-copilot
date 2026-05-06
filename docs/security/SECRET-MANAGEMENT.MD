# Secret 配置管理说明

> 现行口径说明（2026-02-25）：
> - 任务优先级与依赖以 `TODO.MD` 为准。
> - 迭代计划与验收标准以 `docs/verification/ITERATION-PLAN.MD` 为准。
> - 部署与发布以远端 K8s 流程为准：`./scripts/deploy/deploy-remote.sh`。

## ⚠️ 重要说明

**部署前必须确保本地 `.env.secrets` 文件存在且配置完整！**

## 📋 配置文件位置

### 本地（不提交到 Git）
```
<PROJECT_ROOT>/.env.secrets
```

### 远程（临时文件，用后即删）
```
<PROJECT_ROOT_REMOTE>/secrets.env
```

### K8s（生产环境）
```
kubectl get secret sre-copilot-secret -n sre-copilot
```

---

## 🔄 部署流程与 Secret 管理

### 正常流程（`.env.secrets` 存在）
```
1. 本地 .env.secrets 
   ↓ (scp 上传)
2. 远程 secrets.env
   ↓ (kubectl patch)
3. K8s Secret
   ↓ (删除临时文件)
4. 远程 secrets.env 被删除
```

### 问题流程（`.env.secrets` 不存在）
```
1. 本地没有 .env.secrets
   ↓
2. 脚本跳过上传
   ↓
3. kubectl apply -f k8s/secret.yaml (使用占位文件)
   ↓
4. K8s Secret 被覆盖为空值 ❌
```

---

## ✅ 正确的配置方法

### 1. 创建本地 `.env.secrets`

从备份恢复或手动创建：

```bash
cd <PROJECT_ROOT>

# 从备份恢复（推荐）
cat k8s-backup-*/secret-backup.yaml | grep "data:" -A 20

# 手动创建
cat > .env.secrets << 'EOF'
# 企业微信配置
WECOM_TOKEN=你的Token
WECOM_ENCODING_AES_KEY=你的加密密钥(43位)
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
WECOM_WHITELIST=user1,user2,user3

# 蓝鲸 AI 配置
BK_AI_GATEWAY_URL=https://xxx/llm/v1
BK_APP_CODE=你的AppCode
BK_APP_SECRET=你的AppSecret
BK_LLM_MODEL=claude-sonnet-4-5-20250929-v1

# 数据库密码（可选）
POSTGRES_PASSWORD=your_db_password
EOF
```

### 2. 验证配置文件

```bash
# 检查文件是否存在
ls -la .env.secrets

# 检查内容（注意：敏感信息会显示）
cat .env.secrets

# 确认在 .gitignore 中
grep "\.env\.secrets" .gitignore
```

### 3. 部署

```bash
# 快速部署（推荐）
make deploy-fast

# 标准部署
make deploy
```

### 4. 仅重建线上 Secret（不重新部署）

当远端 `.env.secrets` 已正确维护、但只需要把最新密钥重新写回 `sre-copilot-secret` 时，可直接在远端项目目录执行：

```bash
ssh dev 'cd /data/sre-copilot && bash scripts/deploy/rebuild-secret.sh'
ssh dev 'kubectl rollout restart deployment/sre-copilot-app -n sre-copilot'
```

该脚本会基于远端 `.env.secrets` 重建 `sre-copilot-secret`，并固定使用当前生产数据卷实际生效的 `POSTGRES_PASSWORD=postgres`，避免被占位值覆盖。

---

## 🔧 Secret 备份与恢复

### 备份 K8s Secret（定期执行）

```bash
# 创建备份目录
mkdir -p k8s-backup-$(date +%Y%m%d)

# 导出 Secret
ssh dev 'kubectl get secret sre-copilot-secret -n sre-copilot -o yaml' > k8s-backup-$(date +%Y%m%d)/secret-backup.yaml

# 导出 ConfigMap
ssh dev 'kubectl get configmap sre-copilot-config -n sre-copilot -o yaml' > k8s-backup-$(date +%Y%m%d)/configmap-backup.yaml
```

### 从备份恢复 Secret

```bash
# 1. 应用备份文件
ssh dev 'kubectl apply -f - ' < k8s-backup-20260207/secret-backup.yaml

# 2. 重启 Deployment
ssh dev 'kubectl rollout restart deployment/sre-copilot-app -n sre-copilot'

# 3. 验证
ssh dev 'kubectl describe secret sre-copilot-secret -n sre-copilot'
```

### 从备份恢复本地 `.env.secrets`

```bash
# 方法 1: 手动解码 base64
cat k8s-backup-*/secret-backup.yaml | grep "WECOM_TOKEN:" -A 1 | tail -1 | awk '{print $2}' | base64 -d

# 方法 2: 使用脚本（待开发）
./scripts/restore-secrets-from-backup.sh k8s-backup-20260207/secret-backup.yaml
```

---

## 🚨 故障排查

### 症状：部署后企微 Bot 无法响应

**原因**：Secret 被覆盖为空

**解决方案**：
```bash
# 1. 检查 Secret
ssh dev 'kubectl describe secret sre-copilot-secret -n sre-copilot'

# 2. 如果发现值为 0 bytes，从备份恢复
ssh dev 'kubectl apply -f - ' < k8s-backup-20260207/secret-backup.yaml

# 3. 重启服务
ssh dev 'kubectl rollout restart deployment/sre-copilot-app -n sre-copilot'

# 4. 创建本地 .env.secrets（防止下次部署再覆盖）
# （参考上面的方法）
```

---

## 📝 检查清单

### 部署前检查
- [ ] 本地存在 `.env.secrets` 文件
- [ ] `.env.secrets` 包含所有必要配置（WECOM_TOKEN, WECOM_ENCODING_AES_KEY 等）
- [ ] `.env.secrets` 在 `.gitignore` 中（不会被提交）
- [ ] 有最新的 Secret 备份（`k8s-backup-*/secret-backup.yaml`）

### 部署后验证
- [ ] K8s Secret 值正确（不是 0 bytes）
  ```bash
  ssh dev 'kubectl describe secret sre-copilot-secret -n sre-copilot'
  ```
- [ ] Pod 正常启动
  ```bash
  ssh dev 'kubectl get pods -n sre-copilot'
  ```
- [ ] 企微 Bot 正常响应
  ```
  在企微发送: help
  ```

---

## 🔐 安全注意事项

1. **永远不要提交 `.env.secrets` 到 Git**
   - 已在 `.gitignore` 中
   - 提交前检查：`git status`

2. **定期备份 K8s Secret**
   - 每次重要配置变更后备份
   - 备份文件也不要提交到 Git

3. **限制访问权限**
   - `.env.secrets` 权限：`600` (仅当前用户可读写)
   - 备份文件权限：`600`

4. **密钥轮换**
   - 定期更新企微 Token 和密钥
   - 更新后同步更新 `.env.secrets` 和 K8s Secret

---

## 📚 相关文档

- 部署脚本：`scripts/deploy/deploy-remote.sh`
- 部署指南：`DEPLOYMENT-GUIDE.MD`

---

**最后更新**：2026-02-25  
**维护者**：shamcleren
