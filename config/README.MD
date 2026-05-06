# 配置管理系统

## 🎯 设计理念

**只保存配置值，不保存部署结构本身**：

- ✅ 配置值与具体 YAML 结构解耦
- ✅ 便于在结构调整后继续恢复 Secret / ConfigMap
- ✅ 敏感信息集中管理，减少误提交风险

## 📁 关键文件

- `real-config-values.env`：当前真实配置值（不提交 Git）
- `backup-config.sh`：从本地配置导出值备份
- `restore-from-values.sh`：从配置值恢复 Secret / ConfigMap YAML
- `restored/`：恢复脚本生成的 YAML 输出目录

## 🚀 使用方法

### 1. 备份当前配置

```bash
./config/backup-config.sh
```

### 2. 恢复为可应用 YAML

```bash
./config/restore-from-values.sh
```

恢复后会生成：

- `config/restored/restored-secret.yaml`
- `config/restored/restored-configmap.yaml`
- `scripts/dev/config.local.sh`

### 3. 应用到集群

```bash
kubectl apply -f config/restored/restored-secret.yaml
kubectl apply -f config/restored/restored-configmap.yaml
kubectl rollout restart deployment/sre-copilot-app -n sre-copilot
```

## 🔐 安全约束

建议在 `.gitignore` 中忽略以下文件：

```gitignore
config/real-config-values.env
config/config-values-backup-*.env
config/restored/restored-*.yaml
```

## 📌 说明

- `restore-from-values.sh` 只负责恢复 **Secret / ConfigMap**，不负责完整 Deployment 初始化。
- 当前仓库已经不再维护 `k8s/mvp/` 这类旧目录，恢复产物统一写入 `config/restored/`。
- 如需远端发布，请配合 `scripts/deploy/deploy-remote.sh` 或 `make deploy` 使用已有集群资源进行镜像更新。
