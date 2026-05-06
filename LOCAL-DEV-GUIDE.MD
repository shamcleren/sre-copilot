# 🚀 本地开发指南

## 📋 当前定位

当前仓库已经收敛为 **`V2` runtime / replay / compare / workflow / handoff 资产仓库**：

- 默认本地入口是 **workflow 状态判定、离线回归、状态页生成与 handoff 快照刷新**
- `v1/`、compat route regression、`start-local.sh`、`npm run dev` 型本地 HTTP 服务入口都已下线
- 如需验证 `HTTP / MCP / ChatOps` 接口，请准备一个**已经运行中的服务实例**，再用 `BASE_URL` 指向它（默认示例端口为 `3001`）

---

## ⚡ 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 运行默认 workflow 回归
npm run v2:test
npm run workflow:verify

# 3. 读取当前 workflow 状态并按需推进
npm run workflow:check
npm run workflow:resume
npm run workflow:handoff
```

产物位置：

- `docs/verification/V2-READINESS-STATUS.MD`
- `docs/verification/HANDOFF-LATEST.MD`
- `v2/eval/reports/READINESS-*.json`
- `v2/eval/reports/PROJECT-CONTEXT-*.json`

---

## 🧪 常用命令

### 运行时与状态

```bash
# workflow 主入口
npm run workflow:check
npm run workflow:resume
npm run workflow:verify
npm run workflow:refresh
npm run workflow:handoff

# 纯 V2 verify / smoke 辅助入口
npm run runtime:verify
npm run runtime:verify:full
npm run v2:verify
npm run v2:verify:full
npm run runtime:smoke

# 兼容旧名（仅别名，不作为主流程入口）
npm run runtime:context
```

### 回放与对比

```bash
# 运行 V2 replay suite
npm run runtime:replay

# 观察历史 baseline 与当前 V2 的 strict compare
npm run runtime:compare

# baseline replay（需要 AUTH_TOKEN）
AUTH_TOKEN=<token> npm run replay:baseline
AUTH_TOKEN=<token> npm run replay:baseline:gate
```

### Makefile 入口

```bash
make verify-v2-core
make verify-v2-regression
make verify-runtime-core
make verify-runtime-full
make verify-runtime-regression
make runtime-readiness-status
make runtime-handoff
make workflow-check
make workflow-resume
make workflow-verify
make workflow-refresh
make workflow-handoff
make verify-effect-tuning-gate AUTH_TOKEN=<token>
```

> `make local-up-bg` / `make local-restart-bg` 仍保留为兼容型本地实例维护脚本，但**不属于默认工作流**，当前验收链默认面向“已运行的服务实例”。

---

## 🌐 针对已运行服务的接口测试

> 这些脚本**不会**在当前仓库里自动拉起 HTTP 服务；它们默认假设你已经有一个可访问的 `BASE_URL`。

```bash
export BASE_URL=http://127.0.0.1:3001
export AUTH_TOKEN=<token>

# 健康 / 领域 / MCP
bash scripts/test/test-domain-health.sh
bash scripts/test/test-mcp-local.sh
bash scripts/test/test-mcp-executor.sh "$BASE_URL"

# 专家排障入口
node scripts/test/test-expert-diagnosis-entry.js
```

如果你没有本地服务实例，也可以直接指向远端：

```bash
BASE_URL=http://<host>:3001 AUTH_TOKEN=<token> bash scripts/test/test-mcp-local.sh
```

---

## 🔐 环境文件说明

### `.env.secrets`

用于：

- 远端部署脚本上传敏感配置
- 某些需要真实鉴权/外部系统访问的测试脚本
- 配置恢复脚本生成 `config/restored/*.yaml`

### `.env.admin-token`

用于：

- 保留管理员 token / bootstrap token
- 在调用 `/api/admin/*`、`/api/chat`、`/mcp/*` 相关脚本时提供 `AUTH_TOKEN`

如果当前只是做离线回归（`v2:test` / `workflow:refresh` / `workflow:handoff`），**不需要**先准备这两个文件。

---

## 🚢 远端部署入口

当前发布路径只保留 **远端 K8s 部署**：

```bash
# 推荐
make deploy
make deploy-sync
make deploy-fast

# 等价脚本
./scripts/deploy/deploy-remote.sh
```

部署前检查：

```bash
./scripts/deploy/check-remote-env.sh
./scripts/deploy/monitor-deployment.sh
```

---

## 🧹 产物清理

```bash
# 先预览
make workspace-prune DRY_RUN=1

# 确认后执行
make workspace-prune CONFIRM_PRUNE=YES DRY_RUN=0

# verification 滚动清理
make verify-prune
```

---

## ❗ 常见问题

### 1. `tsx` / `tsc` 找不到

```bash
npm install
```

### 2. `workflow:refresh` / `workflow:handoff` 没生成新报告

先确认依赖已安装，再重新执行：

```bash
npm run workflow:refresh
npm run workflow:handoff
```

### 3. HTTP 测试脚本访问失败

这通常不是脚本问题，而是 **没有正在运行的服务**。请检查：

- `BASE_URL` 是否正确
- 目标服务是否真的在 `3001` 提供 `/health`
- `AUTH_TOKEN` 是否有效

### 4. 想做跨版本对齐观察

当前不再提供 `runtime:verify:compat` / `v2:verify:compat`。请改用：

```bash
npm run runtime:compare
```

---

## ✅ 推荐日常流程

```bash
npm install
npm run workflow:resume
npm run workflow:verify
npm run workflow:handoff
```

如果本轮改动涉及 baseline 对齐，再追加：

```bash
npm run runtime:compare
```
