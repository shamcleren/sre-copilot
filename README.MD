# SRE Copilot

> A TypeScript-first SRE troubleshooting runtime and replay/evaluation toolchain.
> This public repository is a sanitized `V2` runtime snapshot: local secrets, private assistant state, internal domains, and internal Git history are not part of the published branch.

## What This Is

**SRE Copilot** is an experimental runtime for structured SRE troubleshooting workflows. It focuses on:

- turning user troubleshooting requests into explicit runtime modes and tool plans
- replaying fixed cases to prevent behavior regressions
- keeping weak-evidence cases collaborative instead of producing generic runbooks
- producing workflow/readiness/handoff reports for development continuity

The current repository shape is **pure `V2` runtime + historical baseline compare layer**. The old `v1/` application, local web server entrypoint, compatibility gate, and `srectl` CLI path have been removed.

## Public Snapshot Boundary

This repository intentionally uses public placeholders for environment-specific infrastructure:

- `sre-copilot.example.com` for public URL examples
- `registry.example.com/sre-copilot` for image registry examples
- `${MCP_API_KEY}` / `<token>` for credentials
- external service adapters configured through environment variables

Do not commit real `.env`, token, private key, kubeconfig, or generated Secret files. The root `.gitignore` already excludes the common local and generated secret paths.

## Core Capabilities

- **Runtime contracts**: mode selection, tool requests, evidence, blockers, and conclusions.
- **Replay suites**: fixed effect-tuning cases under `eval/` and `v2/eval/`.
- **Workflow CLI**: `workflow:*` commands for status, verification, refresh, and handoff.
- **Readiness reports**: generated JSON/Markdown reports under ignored report directories.
- **Deployment helpers**: remote deployment scripts kept as examples that must be configured for your own infrastructure.

## 🧱 顶层结构

```text
sre-copilot/
├── v2/                    # V2 主运行时与专属 eval 资产
├── scripts/               # deploy / dev / test / tools 入口
├── config/                # 配置备份与恢复脚本（输出到 config/restored/）
├── eval/                  # shared baseline 与共享机读报告
├── docs/                  # 设计、路线、验收、handoff 文档
├── knowledge/             # 仓内知识样例
├── Dockerfile             # V2 runtime container example
├── README.MD
├── LOCAL-DEV-GUIDE.MD
├── DEPLOYMENT-GUIDE.MD
├── CHANGELOG.MD
├── TODO.MD
└── Makefile
```

## 🚀 快速开始

### 1. Install Dependencies

```bash
npm ci
```

If you are iterating locally and intentionally updating dependencies, use `npm install` and commit the resulting `package-lock.json`.

### 2. Run The Core Verification

```bash
npm run v2:test
npm run v2:verify:core
```

Expected baseline:

- `npm run v2:test`: 15 runtime regression tests pass
- `npm run v2:verify:core`: typecheck, runtime regression tests, smoke, and replay suite pass

### 3. Check Workflow Status

```bash
npm run workflow:check
npm run workflow:resume
```

### 4. Refresh Generated Status Reports

```bash
npm run workflow:refresh
npm run workflow:handoff
```

常用产物：

- `docs/verification/V2-READINESS-STATUS.MD`
- `docs/verification/HANDOFF-LATEST.MD`
- `v2/eval/reports/READINESS-*.json`
- `v2/eval/reports/PROJECT-CONTEXT-LATEST.json`

### 5. Run Replay / Compare

```bash
npm run runtime:compare
AUTH_TOKEN=<token> npm run replay:baseline
AUTH_TOKEN=<token> npm run replay:baseline:gate
```

## 🧪 常用命令

### Runtime / Eval Commands

```bash
npm run v2:test
npm run workflow:check
npm run workflow:resume
npm run workflow:verify
npm run workflow:refresh
npm run workflow:handoff
npm run runtime:verify
npm run runtime:verify:full
npm run runtime:compare
npm run runtime:smoke
```

### Makefile 入口

```bash
make verify-v2-core
make verify-runtime-core
make verify-runtime-full
make runtime-readiness-status
make runtime-handoff
make workflow-check
make workflow-resume
make workflow-verify
make workflow-refresh
make workflow-handoff
make workspace-prune DRY_RUN=1
```

### Local Offline Verification

```bash
make verify-local-tests
make verify-effect-tuning-gate AUTH_TOKEN=<token>
./eval/run-eval.sh --dry-run
```

## 🌐 外部 HTTP 服务验收（可选）

This repository no longer ships a first-party local HTTP server startup chain. If you run a compatible service externally, the default examples assume `http://127.0.0.1:3001`.

### API / Health

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:3001/api
curl http://127.0.0.1:3001/health
```

### 企业微信回调

```bash
curl 'http://127.0.0.1:3001/wechat/callback?msg_signature=test&timestamp=1234567890&nonce=test&echostr=hello'

curl -X POST http://127.0.0.1:3001/wechat/callback \
  -H "Content-Type: application/xml" \
  -d '<xml>...</xml>'
```

### MCP 接口

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:3001/mcp/status
curl -H "Authorization: Bearer <token>" http://127.0.0.1:3001/mcp/tools
```

### 专家排障入口

```bash
curl -X POST http://127.0.0.1:3001/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -d '{"message":"web-gateway 为什么异常","strategy":"AUTO"}'
```

## 🚢 远端部署

The deployment scripts are retained as configurable examples. Before using them, replace placeholder registry, domain, remote host, namespace, and Secret handling with your own infrastructure settings.

Remote deployment entrypoints:

```bash
make deploy
make deploy-sync
make deploy-fast
./scripts/deploy/check-remote-env.sh
./scripts/deploy/deploy-remote.sh
```

The default script shape is:

1. sync code to a remote build host
2. build an image remotely
3. push the image to `registry.example.com/sre-copilot/`
4. update an existing `deployment/sre-copilot-app`
5. merge uploaded runtime secrets into `sre-copilot-secret`
6. wait for rollout and run `http://127.0.0.1:3001/health` inside the container

The repository does not include a complete Kubernetes bootstrap manifest set. The scripts assume the namespace, Deployment, Service, and Secret already exist.

## 🔐 Configuration And Secrets

```bash
./config/backup-config.sh
./config/restore-from-values.sh
```

恢复脚本会把 YAML 输出到：

- `config/restored/restored-secret.yaml`
- `config/restored/restored-configmap.yaml`

随后可手动应用：

```bash
kubectl apply -f config/restored/restored-secret.yaml
kubectl apply -f config/restored/restored-configmap.yaml
kubectl rollout restart deployment/sre-copilot-app -n sre-copilot
```

Security rules:

- keep real credentials in environment variables or private secret stores
- keep generated `config/restored/*.yaml` files out of source control
- rotate any credential that was ever committed before publishing your own fork
- scan the staged tree before publishing with `rg` or your preferred secret scanner

## 📚 文档入口

- `docs/DOCS-INDEX.MD`：文档总索引
- `docs/design/TECHNICAL-DESIGN.MD`：主设计文档
- `docs/verification/VERIFICATION.MD`：验收与验证说明
- `docs/verification/V2-READINESS-STATUS.MD`：最新 readiness 状态页
- `docs/verification/HANDOFF-LATEST.MD`：默认 handoff 快照
- `LOCAL-DEV-GUIDE.MD`：本地离线验证与工作流说明
- `DEPLOYMENT-GUIDE.MD`：远端部署与巡检说明

## ✅ 当前统一口径

- **主运行时**：`V2`
- **主回归 gate**：`workflow:verify`
- **历史对齐观察**：`runtime:compare`
- **默认续接入口**：`workflow:resume`
- **本地 HTTP 示例端口**：`3001`
- **镜像仓库**：`registry.example.com/sre-copilot/sre-copilot:<timestamp>`

---

**仓库**: `https://github.com/shamcleren/sre-copilot.git`
