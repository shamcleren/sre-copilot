# SRE Copilot Phase 0 Legacy Retirement Implementation Plan

> **Execution rule:** 本计划评审通过后，由人与 AI 半手动、小步骤、逐次验收执行；不要自动委派 subagent。每个 task 的验证、diff 和 commit 都由用户确认后再继续。

**Goal:** 在不丢失 Git 历史的前提下，从当前工作树完整移除旧 `v2/` runtime、共享 eval、replay/compare/workflow、部署与本地运行工具链以及旧主入口文档，为唯一的新 `agent/` core 建立可机器验证的干净基线。

**Architecture:** Git 提交 `7f81522` 是遗留系统的远端历史锚点；当前工作树不保留兼容副本。Phase 0 先删除可执行遗留资产，再删除旧运维入口和活跃文档口径，最后用 `scripts/test/verify-clean-start.sh` 固化“历史可恢复、当前结构唯一”的守门条件。Phase 1 只有在 `npm run clean:start:verify` 通过后才能创建 `agent/`。

**Tech Stack:** Git、Bash、Node.js 20+、npm lockfile、Markdown；不连接网络服务、不访问生产环境、不安装 Pi、不创建 `agent/` 业务代码。

---

## Scope guard

Phase 0 删除的是工作树中的遗留系统，不重写 Git 历史。禁止：

- 对旧 V2 做修复、迁移或兼容封装；
- 为旧 replay/compare 补造历史报告；
- 把旧脚本移动到 `legacy/`、`archive/` 或其他仍可执行目录；
- 在 Phase 0 中创建 Pi extension、adapter、ActionRuntime 或任何业务实现；
- 自动推送、建 PR、连接真实服务或触发部署；
- 未完成当前 task 验收就继续下一个 task。

Phase 0 完成后的活跃结构应为：

```text
.
├── .gitignore
├── AGENTS.MD
├── CHANGELOG.MD
├── README.MD
├── <ROOT-TASK-LIST>.MD
├── package.json
├── package-lock.json
├── docs/
│   ├── DOCS-INDEX.MD
│   ├── design/
│   │   └── SRE-COPILOT-PI-CORE-DESIGN.MD
│   ├── superpowers/plans/
│   │   ├── 2026-08-14-SRE-COPILOT-LEGACY-RETIREMENT-PLAN.MD
│   │   └── 2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD
│   └── verification/
│       └── LEGACY-RETIREMENT-ACCEPTANCE.MD
└── scripts/test/
    └── verify-clean-start.sh
```

`agent/` 尚不存在；它由 Phase 1 创建。`.pi/` 尚不存在；它由后续单独评审的 Pi 接入计划创建。

## Historical recovery contract

- 历史锚点：`7f81522`，提交信息 `docs: design pi sre core`。
- 远端分支：`origin/codex/pi-sre-core`。
- 查看旧树：`git ls-tree -r --name-only 7f81522 v2 eval scripts`。
- 临时研究旧文件：`git show 7f81522:v2/<path>`。
- 禁止通过 checkout 旧树覆盖当前工作树；如未来确需运行旧系统，另建临时 worktree 并单独评审。

---

### Task 0: 验证历史锚点和执行现场

**Files:**
- Read only: `.git/`, worktree status, remote-tracking ref

- [ ] **Step 1: 确认当前分支和工作树只有已评审的规划文档变更**

Run:

```bash
git status --short --branch
git diff -- docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD docs/superpowers/plans/2026-08-14-SRE-COPILOT-LEGACY-RETIREMENT-PLAN.MD docs/superpowers/plans/2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD docs/DOCS-INDEX.MD CHANGELOG.MD
```

Expected: 分支是 `codex/pi-sre-core`；开始删除前，规划文档调整应已经独立提交，工作树应干净。若不是，停止并先处理现场。

- [ ] **Step 2: 证明遗留快照已经在远端历史中**

Run:

```bash
git cat-file -e '7f81522^{commit}'
git merge-base --is-ancestor 7f81522 origin/codex/pi-sre-core
git show --no-patch --format='%H %s' 7f81522
```

Expected: 前两条退出 0；最后一条精确输出 `7f81522... docs: design pi sre core`。

- [ ] **Step 3: 记录删除前清单**

Run:

```bash
git ls-files v2 | wc -l
git ls-files eval | wc -l
git ls-files config | wc -l
git ls-files knowledge | wc -l
git ls-files scripts | wc -l
```

Expected: 依次为 `41`、`8`、`5`、`2`、`47`。数量不一致时先审查新增或缺失文件，不使用模糊删除。

- [ ] **Step 4: 停下等待用户确认**

本 task 不改文件、不提交。向用户展示分支、历史锚点和五组清单数量，得到确认后再进入 Task 1。

---

### Task 1: 删除遗留 runtime、eval 和 npm 入口

**Files:**
- Delete: `v2/**`（41 个 tracked files）
- Delete: `eval/**`（8 个 tracked files）
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 运行失败检查，证明遗留 runtime 仍存在**

Run:

```bash
test ! -d v2
test ! -d eval
node -e "const p=require('./package.json'); const names=Object.keys(p.scripts||{}); if(!names.some((name)=>/^(v2|runtime|workflow|replay):/.test(name))) process.exit(1)"
```

Expected: 前两条失败；第三条退出 0，证明旧 npm 入口仍存在。

- [ ] **Step 2: 精确删除 runtime 与共享 eval**

Run:

```bash
git rm -r v2 eval
```

Expected: 只 staged 删除 `v2/**` 和 `eval/**`，数量分别为 41 和 8。

- [ ] **Step 3: 将根 package 收敛为新 core 所需的纯 TypeScript 工具链**

将 `package.json` 完整替换为：

```json
{
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {},
  "devDependencies": {
    "@types/node": "^25.5.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

这一步删除所有 `v2:*`、`runtime:*`、`workflow:*`、`replay:*` 和 public/deploy aliases，也移除 `pg`、`dotenv`、Playwright 与其类型依赖。Phase 1 复用保留的三项 TypeScript 工具。

- [ ] **Step 4: 只刷新 lockfile，不运行旧生命周期脚本**

Run:

```bash
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
```

Expected: 两条命令退出 0；`package-lock.json` 只包含根 package 和三项 TypeScript devDependencies 的闭包。

- [ ] **Step 5: 运行通过检查**

Run:

```bash
test ! -e v2
test ! -e eval
node - <<'NODE'
const p = require('./package.json');
const expected = ['@types/node', 'tsx', 'typescript'];
if (Object.keys(p.scripts || {}).length !== 0) process.exit(1);
if (Object.keys(p.dependencies || {}).length !== 0) process.exit(1);
if (JSON.stringify(Object.keys(p.devDependencies || {}).sort()) !== JSON.stringify(expected)) process.exit(1);
NODE
git diff --cached --name-only
git diff -- package.json package-lock.json
```

Expected: 所有检查退出 0；差异只涉及 `v2/**`、`eval/**`、`package.json` 和 `package-lock.json`。

- [ ] **Step 6: Commit 并停下**

```bash
git add package.json package-lock.json
git commit -m "refactor: retire legacy runtime and eval"
```

提交后展示 `git show --stat --oneline HEAD` 和 `git status --short`，等待用户确认再进入 Task 2。

---

### Task 2: 删除旧运维工具链、配置和部署入口

**Files:**
- Delete: `config/**`（5 个 tracked files）
- Delete: `knowledge/**`（2 个 tracked files）
- Delete: `scripts/**`（47 个 tracked files）
- Delete: `.dockerignore`
- Delete: `Dockerfile`
- Delete: `Makefile`
- Delete: `mcp-config.json`
- Delete: `nginx-local.conf`
- Delete: `LOCAL-DEV-GUIDE.MD`
- Delete: `DEPLOYMENT-GUIDE.MD`

- [ ] **Step 1: 运行失败检查，证明旧运维入口仍存在**

Run:

```bash
test ! -d scripts
test ! -d config
test ! -d knowledge
test ! -e Makefile
test ! -e Dockerfile
test ! -e mcp-config.json
```

Expected: 检查失败，旧资产仍存在。

- [ ] **Step 2: 精确删除目录和根运行资产**

Run:

```bash
git rm -r config knowledge scripts
git rm .dockerignore Dockerfile Makefile mcp-config.json nginx-local.conf LOCAL-DEV-GUIDE.MD DEPLOYMENT-GUIDE.MD
```

Expected: 只删除本 task `Files` 列出的资产；不要删除 `.gitignore`、`AGENTS.MD`、新设计或两份 2026-08-14 计划。

- [ ] **Step 3: 验证旧运行面全部消失**

Run:

```bash
for path in config knowledge scripts .dockerignore Dockerfile Makefile mcp-config.json nginx-local.conf LOCAL-DEV-GUIDE.MD DEPLOYMENT-GUIDE.MD; do
  test ! -e "$path" || exit 1
done
git diff --cached --name-only
git status --short
```

Expected: 循环退出 0；本 task staged 差异只包含所列 61 个 tracked files。Task 1 已提交的文件不应再次出现。

- [ ] **Step 4: Commit 并停下**

```bash
git commit -m "refactor: remove legacy operations toolchain"
```

提交后展示 `git show --stat --oneline HEAD` 和 `git status --short`，等待用户确认再进入 Task 3。

---

### Task 3: 删除旧活跃文档并重写项目入口

**Files:**
- Delete: `docs/CHATOPS-FEEDBACK-GUIDE.MD`
- Delete: `docs/design/ARCHITECTURE-DECISION-RECORD.MD`
- Delete: `docs/design/CHATOPS-INTENT-DESIGN.MD`
- Delete: `docs/design/CURRENT-IMPLEMENTATION-MAP.MD`
- Delete: `docs/design/DUAL-SYSTEM-DESIGN.MD`
- Delete: `docs/design/SRE-COPILOT-V2-HARNESS-FIRST-DESIGN.MD`
- Delete: `docs/design/SRE-COPILOT-VS-ASSISTANTS-API.MD`
- Delete: `docs/design/TECHNICAL-DESIGN.MD`
- Delete: `docs/design/TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD`
- Delete: `docs/design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD`
- Delete: `docs/review/PROJECT-REVIEW.MD`
- Delete: `docs/roadmap/ROADMAP.MD`
- Delete: `docs/security/SECRET-MANAGEMENT.MD`
- Delete: `docs/superpowers/plans/2026-03-30-WORKFLOW-ORCHESTRATOR-IMPLEMENTATION-PLAN.MD`
- Delete: `docs/superpowers/specs/2026-03-30-WORKFLOW-ORCHESTRATOR-DESIGN.MD`
- Delete: `docs/superpowers/specs/2026-03-31-KNOWLEDGE-ADAPTER-DESIGN.MD`
- Delete: `docs/tools/**`（13 个 tracked files）
- Delete: `docs/verification/ARCHIVE/README.MD`
- Delete: `docs/verification/ITERATION-PLAN.MD`
- Delete: `docs/verification/VERIFICATION.MD`
- Delete: `docs/wecom/WECOM-BOT-GUIDE.MD`
- Modify: `README.MD`
- Modify: 根工作清单文件（shell 中以 `T[D]O.MD` 精确匹配）
- Modify: `AGENTS.MD`
- Modify: `docs/DOCS-INDEX.MD`

- [ ] **Step 1: 运行失败检查，证明活跃索引仍指向 V2**

Run:

```bash
if rg -n 'V2 主运行时|v2:verify|workflow:|v2/' README.MD docs/DOCS-INDEX.MD; then exit 1; fi
```

Expected: FAIL 并输出旧主入口、旧目录或旧命令。

- [ ] **Step 2: 删除全部旧活跃文档**

Run:

```bash
git rm docs/CHATOPS-FEEDBACK-GUIDE.MD \
  docs/design/ARCHITECTURE-DECISION-RECORD.MD \
  docs/design/CHATOPS-INTENT-DESIGN.MD \
  docs/design/CURRENT-IMPLEMENTATION-MAP.MD \
  docs/design/DUAL-SYSTEM-DESIGN.MD \
  docs/design/SRE-COPILOT-V2-HARNESS-FIRST-DESIGN.MD \
  docs/design/SRE-COPILOT-VS-ASSISTANTS-API.MD \
  docs/design/TECHNICAL-DESIGN.MD \
  docs/design/TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD \
  docs/design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD \
  docs/review/PROJECT-REVIEW.MD \
  docs/roadmap/ROADMAP.MD \
  docs/security/SECRET-MANAGEMENT.MD \
  docs/superpowers/plans/2026-03-30-WORKFLOW-ORCHESTRATOR-IMPLEMENTATION-PLAN.MD \
  docs/superpowers/specs/2026-03-30-WORKFLOW-ORCHESTRATOR-DESIGN.MD \
  docs/superpowers/specs/2026-03-31-KNOWLEDGE-ADAPTER-DESIGN.MD \
  docs/verification/ARCHIVE/README.MD \
  docs/verification/ITERATION-PLAN.MD \
  docs/verification/VERIFICATION.MD \
  docs/wecom/WECOM-BOT-GUIDE.MD
git rm -r docs/tools
```

Expected: 只保留 `docs/DOCS-INDEX.MD`、Pi Core 设计、两份 2026-08-14 计划；`docs/verification/` 暂时为空。

- [ ] **Step 3: 重写 README 为新路线入口**

`README.MD` 必须只保留下列信息：

```markdown
# SRE Copilot

SRE Copilot 正在以 Pi-compatible action runtime 的方向重新建立。旧 V2 runtime、评估链和运维工具已从当前工作树退役；历史快照保留在 Git 提交 `7f81522`。

## 当前状态

- Phase 0：遗留系统退役执行中；完成条件是 `npm run clean:start:verify` 通过。
- Phase 1：尚未开始；只实现 `demo-service` 5xx 告警 fake vertical slice。
- 当前没有可连接生产环境的 runtime、部署入口或 Pi extension。

## 设计与计划

- 架构设计：`docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD`
- Phase 0：`docs/superpowers/plans/2026-08-14-SRE-COPILOT-LEGACY-RETIREMENT-PLAN.MD`
- Phase 1：`docs/superpowers/plans/2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD`
- 文档索引：`docs/DOCS-INDEX.MD`

## 安全边界

不要提交真实 `.env`、token、私钥、kubeconfig、Cookie、Authorization header 或生成的 Secret 文件。新 core 在接入任何真实系统前必须单独完成 adapter、权限、确认、审计和回滚评审。
```

- [ ] **Step 4: 重写唯一工作清单**

将根工作清单文件收敛为：

```markdown
# SRE Copilot 工作清单

> 当前只跟踪新 Pi Core 路线；旧系统进展保留在 Git 历史。

## Phase 0：遗留系统退役

- [x] 确认远端历史锚点 `7f81522`。
- [x] 删除旧 runtime、共享 eval 和 npm 入口。
- [x] 删除旧配置、部署、本地运行和运维脚本。
- [x] 删除旧活跃文档并重写项目入口。
- [ ] 建立 clean-start guard 并落盘验收记录。

## Phase 1：Pi Core fake vertical slice

- [ ] Phase 0 验收通过后，按实施计划逐 task 执行。
- [ ] 只实现 `demo-service` 5xx 告警创建。
- [ ] 完成离线 typecheck、测试和可追溯验收报告。
```

- [ ] **Step 5: 更新协作规范中的新目录职责**

在 `AGENTS.MD` 中完成以下精确调整：

1. 主设计入口改为 `docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD`。
2. 根入口列表移除 `LOCAL-DEV-GUIDE.MD` 和 `DEPLOYMENT-GUIDE.MD`。
3. `docs/` 子域改为 `design/superpowers/verification`。
4. `agent/` 定义为唯一业务 core；`.pi/` 定义为后续 harness integration。
5. `scripts/` 只承载稳定的开发/验收脚本；禁止恢复 legacy runtime、replay、compare、workflow 或部署别名。
6. 删除 `eval/`、`v2/eval/` 和旧报告家族的目录约定与滚动策略。
7. 保留“失败修根因、逐阶段验收、报告落盘、临时产物固化”四条长期纪律。

- [ ] **Step 6: 将文档索引重写为四个唯一入口**

`docs/DOCS-INDEX.MD` 此时应为：

```markdown
# SRE Copilot 文档索引

> 当前口径：旧 V2 runtime、评估链和运维工具已从工作树退役；新代码只能进入 `agent/` 路线。

## 架构设计

- `docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD` - Pi-compatible action runtime 的架构、不变量、信任边界与阶段路线。

## 实施计划

- `docs/superpowers/plans/2026-08-14-SRE-COPILOT-LEGACY-RETIREMENT-PLAN.MD` - Phase 0 遗留 runtime、工具链和活跃文档退役计划。
- `docs/superpowers/plans/2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD` - Phase 1 `demo-service` 5xx 告警 fake vertical slice 实施计划。

## 验收

- Phase 0 完成后由 `docs/verification/LEGACY-RETIREMENT-ACCEPTANCE.MD` 记录 clean-start 验收。
```

- [ ] **Step 7: 验证活跃文档集合和口径**

Run:

```bash
git ls-files docs | sort
if rg -n 'V2 主运行时|npm run v2:|npm run workflow:|make verify|v2/eval/' README.MD T[D]O.MD AGENTS.MD docs/DOCS-INDEX.MD; then exit 1; fi
find . -path './.git' -prune -o -path './node_modules' -prune -o -type f -name '*.md' -print
```

Expected: tracked docs 只包含 Pi Core 设计、Phase 0/1 计划和索引；第一条内容检查无匹配；最后一条无输出。

- [ ] **Step 8: Commit 并停下**

```bash
git add README.MD T[D]O.MD AGENTS.MD docs/DOCS-INDEX.MD
git commit -m "docs: make pi core the only active direction"
```

提交后展示 `git show --stat --oneline HEAD` 和 `git status --short`，等待用户确认再进入 Task 4。

---

### Task 4: 固化 clean-start guard 和验收记录

**Files:**
- Create: `scripts/test/verify-clean-start.sh`
- Create: `docs/verification/LEGACY-RETIREMENT-ACCEPTANCE.MD`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `README.MD`
- Modify: 根工作清单文件（shell 中以 `T[D]O.MD` 精确匹配）
- Modify: `docs/DOCS-INDEX.MD`
- Modify: `CHANGELOG.MD`

- [ ] **Step 1: 先加入 npm 入口并证明 guard 尚不存在**

将 `package.json` 的 scripts 改为：

```json
"scripts": {
  "clean:start:verify": "bash scripts/test/verify-clean-start.sh"
}
```

Run:

```bash
npm run clean:start:verify
```

Expected: FAIL，错误指向 `scripts/test/verify-clean-start.sh` 不存在。

- [ ] **Step 2: 创建完整 clean-start guard**

`scripts/test/verify-clean-start.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

for path in \
  v2 eval config knowledge \
  .dockerignore Dockerfile Makefile mcp-config.json nginx-local.conf \
  LOCAL-DEV-GUIDE.MD DEPLOYMENT-GUIDE.MD \
  docs/tools docs/wecom docs/review docs/roadmap docs/security \
  docs/superpowers/specs
do
  if [[ -e "$path" ]]; then
    echo "legacy path present: $path" >&2
    exit 1
  fi
done

script_files="$(find scripts -type f -print | sort)"
if [[ "$script_files" != "scripts/test/verify-clean-start.sh" ]]; then
  printf 'unexpected scripts:\n%s\n' "$script_files" >&2
  exit 1
fi

node --input-type=commonjs <<'NODE'
const packageJson = require('./package.json');
const allowedScripts = new Set([
  'clean:start:verify',
  'agent:typecheck',
  'agent:test',
  'agent:verify',
]);
for (const name of Object.keys(packageJson.scripts || {})) {
  if (!allowedScripts.has(name)) throw new Error(`unexpected npm script: ${name}`);
}
if (packageJson.scripts?.['clean:start:verify'] !== 'bash scripts/test/verify-clean-start.sh') {
  throw new Error('clean:start:verify does not invoke the stable guard');
}
for (const name of ['@playwright/test', '@types/pg', 'dotenv', 'pg', 'playwright']) {
  if (packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]) {
    throw new Error(`legacy dependency present: ${name}`);
  }
}
for (const name of ['@types/node', 'tsx', 'typescript']) {
  if (!packageJson.devDependencies?.[name]) throw new Error(`required devDependency missing: ${name}`);
}
NODE

if git ls-files | rg '(^|/)(v2|eval|config|knowledge)/|(^|/)(compare-v1-v2|workflow-orchestrator)|(^|/)verify-v2'; then
  echo 'legacy tracked asset present' >&2
  exit 1
fi

if find . -path './.git' -prune -o -path './node_modules' -prune -o -type f -name '*.md' -print | grep -q .; then
  echo 'lowercase Markdown filename present' >&2
  exit 1
fi

echo 'clean-start verification: PASS'
```

设置执行位：

```bash
chmod +x scripts/test/verify-clean-start.sh
```

- [ ] **Step 3: 将 `.gitignore` 收敛为新 core 的安全和构建边界**

完整保留以下类别，删除 V1/V2/eval/report 专用 exceptions：

```gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo

.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx
*.kubeconfig
kubeconfig*

.DS_Store
*.log
.cache/
.tmp/
tmp/
```

- [ ] **Step 4: 写入可追溯验收报告**

创建 `docs/verification/LEGACY-RETIREMENT-ACCEPTANCE.MD`，内容必须包括：

```markdown
# Legacy Retirement 验收记录

> 日期：2026-08-14<br>
> 范围：Phase 0 干净基线<br>
> 历史锚点：`7f81522` (`origin/codex/pi-sre-core`)<br>
> 结果：PASS

## 删除范围

- `v2/`：41 个 tracked files。
- `eval/`：8 个 tracked files。
- `config/`：5 个 tracked files。
- `knowledge/`：2 个 tracked files。
- 旧 `scripts/`：47 个 tracked files，由单一 clean-start guard 替代。
- Docker、Makefile、nginx、MCP、本地开发、部署和旧活跃文档入口已退役。

## 验证

| 命令 | 结果 |
|---|---|
| `npm ci --ignore-scripts` | PASS |
| `npm run clean:start:verify` | PASS |

## 结论

当前工作树不存在可执行旧 runtime、兼容别名或旧部署入口。旧实现仍可从 Git 提交 `7f81522` 查阅；Phase 1 可以从唯一的 `agent/` 路线开始。
```

报告只有在两条命令实际通过后才能写为 PASS；工作树状态在 commit 后单独复验。

- [ ] **Step 5: 将项目入口切换为 Phase 0 完成**

精确更新：

- `README.MD`：把“Phase 0 执行中”改为“Phase 0 已完成，`clean:start:verify` 是前置门禁”。
- 根工作清单文件：勾选“建立 clean-start guard 并落盘验收记录”。
- `docs/DOCS-INDEX.MD`：把验收占位改为正式链接 `docs/verification/LEGACY-RETIREMENT-ACCEPTANCE.MD`。
- `CHANGELOG.MD`：将历史长日志收敛为当前 `[未发布]` 的 Phase 0 记录，并明确旧历史位于 `7f81522`，不复制旧阶段明细。

`CHANGELOG.MD` 最小内容：

```markdown
# 变更记录

## [未发布]

### Phase 0：干净基线（2026-08-14）

- 旧 V2 runtime、共享 eval、replay/compare/workflow、运维脚本和旧活跃文档入口已从工作树退役。
- 根 npm 入口和依赖已收敛为新 `agent/` core 所需的 TypeScript 工具链。
- 新增 `npm run clean:start:verify` 和 `docs/verification/LEGACY-RETIREMENT-ACCEPTANCE.MD`。
- 遗留系统最后一个已推送快照保留在 Git 提交 `7f81522`。

### Pi Core 设计（2026-08-14）

- 新增 Pi-compatible action runtime 架构设计。
- 新增 Phase 0 遗留系统退役计划和 Phase 1 fake 告警 vertical slice 实施计划。
```

- [ ] **Step 6: 运行完整 Phase 0 gate**

Run:

```bash
npm ci --ignore-scripts
npm run clean:start:verify
git diff --check
git status --short
```

Expected: 前三条退出 0，guard 输出 `clean-start verification: PASS`；status 只显示本 task 的预期文件。

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json scripts/test/verify-clean-start.sh README.MD T[D]O.MD docs/DOCS-INDEX.MD docs/verification/LEGACY-RETIREMENT-ACCEPTANCE.MD CHANGELOG.MD
git commit -m "test: enforce clean pi core baseline"
```

- [ ] **Step 8: 提交后最终复验并停下**

Run:

```bash
npm run clean:start:verify
git status --short --branch
git log --oneline -5
```

Expected: guard PASS；工作树干净；最近历史依次包含 Phase 0 的 runtime、toolchain、docs 和 guard commits。不要自动推送，也不要开始 Phase 1。

---

## Final acceptance checklist

- [ ] `7f81522` 可从 `origin/codex/pi-sre-core` 的历史访问。
- [ ] `v2/`、`eval/`、`config/`、`knowledge/` 不存在。
- [ ] 旧 Docker、Makefile、nginx、MCP、本地开发和部署入口不存在。
- [ ] 旧 replay、compare、workflow、readiness 和 handoff 脚本不存在。
- [ ] npm scripts 只包含 clean-start guard，或 Phase 1 后允许的 `agent:*` 入口。
- [ ] 根依赖只保留新 TypeScript core 所需工具。
- [ ] 活跃文档只描述 Phase 0/Phase 1 新路线；旧材料只在 Git 历史中。
- [ ] `README.MD`、根工作清单、`AGENTS.MD` 和 `docs/DOCS-INDEX.MD` 口径一致。
- [ ] `docs/verification/LEGACY-RETIREMENT-ACCEPTANCE.MD` 与实际命令结果一致。
- [ ] `npm run clean:start:verify` 从干净 checkout 离线通过。
- [ ] `.pi/` 和 `agent/` 均未在 Phase 0 创建。
- [ ] 工作树干净，等待用户决定是否推送或开始 Phase 1。

## Phase 1 handoff

用户确认 Phase 0 验收后，按 `docs/superpowers/plans/2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD` 从 Task 1 开始。第一条命令必须是 `npm run clean:start:verify`；失败时只修复 clean-start 根因，不创建 `agent/` 绕过门禁。
