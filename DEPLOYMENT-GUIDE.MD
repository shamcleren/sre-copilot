# SRE Copilot 部署指南

> 当前仓库的**现行部署方式**是：在项目根目录通过 `make deploy` / `make deploy-fast` 或 `scripts/deploy/deploy-remote.sh` 执行**远端 K8s 发布**。
>
> 本仓库已不再维护 `v1/`、`k8s/mvp/`、`run-local.sh`、`init-db.sh` 这类旧入口；如你看到历史记录中的旧命令，请以本文为准。

## 当前部署模型

当前部署链路：

```text
本地工作区
  -> ssh / rsync 到 dev
  -> 远端构建 Docker 镜像
  -> 推送到 registry.example.com/sre-copilot/
  -> 更新现有 deployment/sre-copilot-app 镜像
  -> rollout + 健康检查
```

### 当前约束

- **镜像标签禁止使用 `latest`**
- **必须使用时间戳版本**：`YYYYMMDD-HHMMSS`
- **生产镜像仓库**：`registry.example.com/sre-copilot/sre-copilot:<timestamp>`
- **集群内健康检查端口**：`3001`
- **当前脚本负责镜像更新与 Secret 覆盖，不负责首次集群初始化**

## 常用命令

### 推荐入口

```bash
make deploy
make deploy-sync
make deploy-fast
make check
make logs
make status
```

### 等价脚本入口

```bash
./scripts/deploy/check-remote-env.sh
./scripts/deploy/deploy-remote.sh
./scripts/deploy/monitor-deployment.sh
```

## 快速开始

### 1. 准备本地敏感配置

在项目根目录准备：

- `.env.secrets`
- 可选：`.env.admin-token`

部署脚本会把 `.env.secrets` 上传到远端为 `secrets.env`，并把非数据库敏感项 merge 到集群里的 `sre-copilot-secret`。

### 2. 执行部署

```bash
make deploy-fast
```

等价于：

```bash
./scripts/deploy/deploy-remote.sh --yes --sync
```

### 3. 脚本会自动完成

- 检查 `ssh dev`
- 同步或推送代码
- 在远端构建镜像
- 推送镜像到 `registry.example.com/sre-copilot/`
- 更新 `deployment/sre-copilot-app`
- 合并 `secrets.env` 到 `sre-copilot-secret`
- 等待 rollout
- 在运行中的 Pod 内访问 `http://127.0.0.1:3001/health`

## 部署前检查

### 环境要求

- 本地已配置 `ssh dev`
- 远端已有可用 `kubectl` context
- 集群中已存在：
  - `namespace/sre-copilot`
  - `deployment/sre-copilot-app`
  - `secret/sre-copilot-secret`
- 远端 Docker 已登录 `registry.example.com`

### 检查命令

```bash
make check
ssh dev 'kubectl get deployment sre-copilot-app -n sre-copilot'
ssh dev 'kubectl get secret sre-copilot-secret -n sre-copilot'
```

## 健康检查与验证

### 部署后检查

```bash
ssh dev 'kubectl get pods -n sre-copilot'
ssh dev 'kubectl get svc -n sre-copilot'
ssh dev 'kubectl logs deployment/sre-copilot-app -n sre-copilot --tail=50'
```

### 容器内健康检查

```bash
ssh dev 'kubectl exec deployment/sre-copilot-app -n sre-copilot -- curl -s http://127.0.0.1:3001/health'
```

### 远端线上回归

```bash
make verify-online AUTH_TOKEN=<token>
```

## Secret 与配置恢复

### 重新生成恢复文件

```bash
./config/restore-from-values.sh
```

输出目录：

- `config/restored/restored-secret.yaml`
- `config/restored/restored-configmap.yaml`

### 手动应用

```bash
kubectl apply -f config/restored/restored-secret.yaml
kubectl apply -f config/restored/restored-configmap.yaml
kubectl rollout restart deployment/sre-copilot-app -n sre-copilot
```

## 回滚

### 回滚到上一版

```bash
ssh dev 'kubectl rollout undo deployment/sre-copilot-app -n sre-copilot'
```

### 查看 rollout 历史

```bash
ssh dev 'kubectl rollout history deployment/sre-copilot-app -n sre-copilot'
```

## 常见问题

### 1. 找不到 `deployment/sre-copilot-app`

这表示集群基础资源未准备好。当前仓库**不再自带完整 `k8s/` 清单目录**，部署脚本无法帮你初始化整套资源；需要先在集群侧创建好基础 Deployment / Service / Secret。

### 2. 健康检查失败

优先检查：

```bash
ssh dev 'kubectl logs deployment/sre-copilot-app -n sre-copilot --tail=100'
ssh dev 'kubectl describe pods -n sre-copilot'
```

同时确认服务监听端口与脚本口径一致：**`3001`**。

### 3. Secret 没生效

确认远端脚本上传了 `.env.secrets`，并检查：

```bash
ssh dev 'kubectl get secret sre-copilot-secret -n sre-copilot -o yaml | head -40'
```

如果只是更新 Secret，可单独执行：

```bash
ssh dev 'cd /data/sre-copilot && bash scripts/deploy/rebuild-secret.sh'
ssh dev 'kubectl rollout restart deployment/sre-copilot-app -n sre-copilot'
```

## 现行推荐

- **部署**：`make deploy-fast`
- **巡检**：`make check` / `make status` / `make logs`
- **远端回归**：`make verify-online AUTH_TOKEN=<token>`
- **配置恢复**：`./config/restore-from-values.sh`

---

如需历史背景，请查看 `CHANGELOG.MD`；如需当前仓库主入口，请回到 `README.MD` 与 `LOCAL-DEV-GUIDE.MD`。
