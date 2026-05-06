# SRE Copilot - V2 Runtime / Eval Toolchain

> 面向排障与回放验收的 `V2` 运行时资产仓库，当前默认开发流程入口已收口到 `workflow:*`，底层继续复用 `replay / compare / readiness / handoff` 与远端部署辅助脚本。

## 🎯 当前定位

**SRE Copilot** 当前已经收敛为 **纯 `V2` 主运行时 + 历史 baseline compare 观察层** 的仓库形态。

当前仓库主要承载：

- **`V2` 运行时**：位于 `v2/`，包含 runtime、contracts、playbooks、tools 与 observability 读取逻辑。
- **回放与对比**：通过 `eval/` 与 `v2/eval/` 维护 shared baseline、V2 replay、compare 与 readiness 产物。
- **状态与交接**：优先通过 `npm run workflow:check` / `workflow:resume` / `workflow:verify` / `workflow:refresh` / `workflow:handoff` 判断当前状态并推进下一步；`docs/verification/` 下的派生状态页与 handoff 快照也默认由这些 workflow 入口刷新。
- **远端部署辅助**：保留 `scripts/deploy/`、`Makefile` 与 `config/` 下的远端 K8s 发布、配置恢复与巡检脚本。

> 当前仓库 **不再包含** `v1/` 本地运行时、`compat` gate、`npm run dev` 型开发入口或 `srectl` CLI 主链。

## ✨ 核心能力

- **V2 Runtime**：纯 TypeScript 的排障运行时与契约层。
- **Replay / Compare**：共享 baseline 回放、V2 compare 与 readiness 汇总。
- **Workflow / Handoff**：自动生成 `WORKFLOW-STATUS-LATEST.json`，并继续派生 `V2-READINESS-STATUS.MD` 与 `HANDOFF-LATEST.MD`。
- **Verification Tooling**：集中在 `scripts/test/` 与 `Makefile` 的验收、对比、报告清理入口。
- **Remote Ops**：保留远端镜像构建、Deployment 更新、日志巡检与配置恢复工具。

## 🧱 顶层结构

```text
sre-copilot/
├── v2/                    # V2 主运行时与专属 eval 资产
├── scripts/               # deploy / dev / test / tools 入口
├── config/                # 配置备份与恢复脚本（输出到 config/restored/）
├── eval/                  # shared baseline 与共享机读报告
├── docs/                  # 设计、路线、验收、handoff 文档
├── knowledge/             # 仓内知识样例
├── README.MD
├── LOCAL-DEV-GUIDE.MD
├── DEPLOYMENT-GUIDE.MD
├── CHANGELOG.MD
├── TODO.MD
└── Makefile
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 运行默认 workflow 回归与刷新链

```bash
npm run v2:test
npm run workflow:verify
npm run workflow:refresh
```

说明：

- `npm run workflow:verify` = 当前默认纯 `V2` core gate
- `npm run workflow:refresh` = 默认刷新 readiness / project context 等派生产物
- `npm run workflow:handoff` = 默认刷新最新 handoff 快照
- `npm run runtime:compare` = 历史 baseline 观察入口，不阻断纯 `V2` readiness

### 3. 读取当前 workflow 状态并按需推进

```bash
npm run workflow:check
npm run workflow:resume
npm run workflow:handoff
```

常用产物：

- `docs/verification/V2-READINESS-STATUS.MD`
- `docs/verification/HANDOFF-LATEST.MD`
- `v2/eval/reports/READINESS-*.json`
- `v2/eval/reports/PROJECT-CONTEXT-LATEST.json`

### 4. 查看 compare / replay 产物

```bash
npm run runtime:compare
AUTH_TOKEN=<token> npm run replay:baseline
AUTH_TOKEN=<token> npm run replay:baseline:gate
```

## 🧪 常用命令

### Runtime / Eval

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

### 本地离线验收

```bash
make verify-local-tests
make verify-effect-tuning-gate AUTH_TOKEN=<token>
./eval/run-eval.sh --dry-run
```

## 🌐 外部 HTTP 服务验收（可选）

当前仓库不再自带本地 HTTP 服务启动链；如果你已经在外部环境启动了兼容服务（默认示例使用 `http://127.0.0.1:3001`），可继续使用以下接口做集成验证。

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

远端发布主入口：

```bash
make deploy
make deploy-sync
make deploy-fast
./scripts/deploy/check-remote-env.sh
./scripts/deploy/deploy-remote.sh
```

当前 `deploy-remote.sh` 的职责是：

1. 推送或同步代码到远端 `dev`
2. 在远端构建镜像并推送到 `registry.example.com/sre-copilot/`
3. 直接更新集群中现有 `deployment/sre-copilot-app` 的镜像版本
4. 合并上传的 `secrets.env` 到 `sre-copilot-secret`
5. 等待 rollout，并在容器内执行 `http://127.0.0.1:3001/health` 健康检查

> 注意：当前仓库 **不再自带完整 `k8s/` 清单目录**。远端部署依赖集群侧已存在的基础 Deployment / Service / Secret 资源；脚本负责镜像更新与 Secret 覆盖，不负责首次集群引导。

## 🔐 配置恢复

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
