# Workflow Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前仓库落地 `workflow:*` 开发流程编排层，让新 session 和日常开发只需要面对一个当前状态和唯一推荐下一步。

**Architecture:** 在 `v2/eval/workflow/` 新增 workflow 判定、执行、写盘与展示层；保留 `runtime:verify:core / runtime:status / runtime:handoff / runtime:compare` 作为底层能力；把现有 `project-context-status.ts` 中的 dirty / TODO / artifact 读取逻辑抽成共享状态源，供 handoff 与 workflow 共用。

**Tech Stack:** TypeScript、`tsx`、Node.js `node:test`、Bash、Makefile、Markdown

---

## File Map

### Create

- `v2/eval/workflow/types.ts`
  - 统一定义 `WorkflowState`、`WorkflowStateReport`、`WorkflowSourceSnapshot`、`WorkflowAction` 等合同。
- `v2/eval/workflow/source-snapshot.ts`
  - 读取 Git 现场、最新 readiness/compare/replay/context artifacts、`TODO.MD` 当前重点与未完成项，并完成 dirty 分类。
- `v2/eval/workflow/detector.ts`
  - 基于 `WorkflowSourceSnapshot` 计算唯一状态、原因、required actions 与推荐命令。
- `v2/eval/workflow/presenter.ts`
  - 生成 workflow CLI 的人类可读输出，以及 `--json` 模式下的稳定结构。
- `v2/eval/workflow/actions.ts`
  - 把 `workflow:check / resume / verify / refresh / handoff` 映射到底层 `runtime:*` 执行计划。
- `v2/eval/runners/workflow.ts`
  - workflow 总 runner；负责解析动作、执行底层命令、写入 `WORKFLOW-STATUS-LATEST.json`、打印输出。
- `v2/tests/workflow-detector.test.ts`
  - 覆盖状态优先级、dirty 分类影响、最小必要验证矩阵。
- `v2/tests/workflow-runner.test.ts`
  - 覆盖动作到命令的映射、状态写盘、CLI 文本输出。

### Modify

- `v2/eval/runners/project-context-status.ts`
  - 改为复用 `source-snapshot.ts` 中的共享读取逻辑，避免 workflow 与 handoff 各自维护一套 dirty / TODO / artifact 读取规则。
- `package.json`
  - 新增 `workflow`、`workflow:resume`、`workflow:check`、`workflow:verify`、`workflow:refresh`、`workflow:handoff` 脚本入口。
- `Makefile`
  - 新增 workflow 帮助信息与 `make workflow-*` 包装目标。
- `README.MD`
  - 把日常开发续接入口从“读 handoff 再手工判断”升级为“优先跑 `workflow:*`，handoff/readiness 为派生视图”。
- `LOCAL-DEV-GUIDE.MD`
  - 增加 workflow 用法、状态含义与最小动作说明。
- `docs/verification/HANDOFF-PROTOCOL.MD`
  - 补充 workflow 与 handoff 的职责分层：workflow 决策，handoff 展示。
- `docs/verification/VERIFICATION.MD`
  - 把 workflow 相关的最小必要验证矩阵写入现行验收规范。
- `docs/DOCS-INDEX.MD`
  - 新增 implementation plan 入口。
- `CHANGELOG.MD`
  - 记录 workflow 实现计划落地。

---

### Task 1: 建立 Workflow 状态合同与判定器

**Files:**
- Create: `v2/eval/workflow/types.ts`
- Create: `v2/eval/workflow/detector.ts`
- Test: `v2/tests/workflow-detector.test.ts`

- [ ] **Step 1: 写失败测试，锁定状态优先级与推荐命令**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { detectWorkflowState } from '../eval/workflow/detector';
import type { WorkflowSourceSnapshot } from '../eval/workflow/types';

function buildSnapshot(overrides: Partial<WorkflowSourceSnapshot> = {}): WorkflowSourceSnapshot {
  return {
    timestamp: '2026-03-30T15:30:00.000Z',
    currentFocus: 'workflow orchestrator 落地',
    openTodos: ['实现 workflow:check'],
    dirtyFiles: [],
    dirtyHotspots: [],
    dirtySummary: {
      hasRuntimeChanges: false,
      hasDocsChanges: false,
      hasUnknownChanges: false,
      unknownFiles: [],
    },
    latestArtifacts: {
      handoffPath: 'docs/verification/HANDOFF-LATEST.MD',
      readinessPath: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContextPath: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      workflowStatusPath: 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json',
      comparePath: 'v2/eval/reports/COMPARE-LATEST.json',
      replayPath: 'eval/reports/REPLAY-LATEST.json',
      handoffFresh: true,
      readinessFresh: true,
      workflowFresh: true,
    },
    readiness: {
      available: true,
      currentStage: 'V2 已接管主入口，进入替换后观测',
      acceptanceStatus: '验收通过',
      coreReady: true,
      baselineReady: true,
      compareReady: true,
      fullReady: true,
      latestVerifyFailed: false,
      needsStatusRefresh: false,
    },
    previousWorkflow: null,
    ...overrides,
  };
}

test('detectWorkflowState 返回 verification_needed 当 runtime dirty 且未完成最小验证', () => {
  const report = detectWorkflowState(buildSnapshot({
    dirtyFiles: [{ status: 'M', file: 'v2/eval/runners/project-context-status.ts' }],
    dirtyHotspots: ['M v2/eval/runners/project-context-status.ts'],
    dirtySummary: {
      hasRuntimeChanges: true,
      hasDocsChanges: false,
      hasUnknownChanges: false,
      unknownFiles: [],
    },
    readiness: {
      available: true,
      currentStage: '进行中',
      acceptanceStatus: '进行中',
      coreReady: false,
      baselineReady: false,
      compareReady: true,
      fullReady: false,
      latestVerifyFailed: false,
      needsStatusRefresh: false,
    },
  }));

  assert.equal(report.state, 'verification_needed');
  assert.equal(report.recommendedCommand, 'npm run workflow:verify');
  assert.match(report.reason, /minimal verify/i);
});

test('detectWorkflowState 返回 blocked 当最近验证失败', () => {
  const report = detectWorkflowState(buildSnapshot({
    readiness: {
      available: true,
      currentStage: '进行中',
      acceptanceStatus: '验收失败/阻塞',
      coreReady: false,
      baselineReady: false,
      compareReady: false,
      fullReady: false,
      latestVerifyFailed: true,
      needsStatusRefresh: true,
    },
  }));

  assert.equal(report.state, 'blocked');
  assert.equal(report.recommendedCommand, 'npm run workflow:check');
  assert.ok(report.requiredActions.includes('修复最近一次验证失败'));
});

test('detectWorkflowState 返回 ready_to_develop 当现场干净且状态已最新', () => {
  const report = detectWorkflowState(buildSnapshot());

  assert.equal(report.state, 'ready_to_develop');
  assert.equal(report.recommendedCommand, 'none');
  assert.equal(report.requiredActions.length, 0);
});
```

- [ ] **Step 2: 运行测试，确认当前缺少 detector/types 实现而失败**

Run: `./node_modules/.bin/tsx --test v2/tests/workflow-detector.test.ts`

Expected: FAIL，报错包含 `Cannot find module '../eval/workflow/detector'` 或缺少 `detectWorkflowState` 导出。

- [ ] **Step 3: 写最小实现，先让状态优先级落地**

`v2/eval/workflow/types.ts`

```ts
export type WorkflowState =
  | 'blocked'
  | 'resume_needed'
  | 'verification_needed'
  | 'status_refresh_needed'
  | 'handoff_ready'
  | 'ready_to_develop';

export interface WorkflowDirtySummary {
  hasRuntimeChanges: boolean;
  hasDocsChanges: boolean;
  hasUnknownChanges: boolean;
  unknownFiles: string[];
}

export interface WorkflowLatestArtifacts {
  handoffPath: string;
  readinessPath: string;
  projectContextPath: string;
  workflowStatusPath: string;
  comparePath: string;
  replayPath: string;
  handoffFresh: boolean;
  readinessFresh: boolean;
  workflowFresh: boolean;
}

export interface WorkflowReadinessSnapshot {
  available: boolean;
  currentStage: string;
  acceptanceStatus: string;
  coreReady: boolean;
  baselineReady: boolean;
  compareReady: boolean;
  fullReady: boolean;
  latestVerifyFailed: boolean;
  needsStatusRefresh: boolean;
}

export interface WorkflowSourceSnapshot {
  timestamp: string;
  currentFocus: string;
  openTodos: string[];
  dirtyFiles: Array<{ status: string; file: string }>;
  dirtyHotspots: string[];
  dirtySummary: WorkflowDirtySummary;
  latestArtifacts: WorkflowLatestArtifacts;
  readiness: WorkflowReadinessSnapshot;
  previousWorkflow: WorkflowStateReport | null;
}

export interface WorkflowStateReport {
  timestamp: string;
  state: WorkflowState;
  reason: string;
  currentFocus: string;
  dirtyHotspots: string[];
  requiredActions: string[];
  recommendedCommand: string;
  artifacts: WorkflowLatestArtifacts;
  derivedFrom: {
    todo: 'TODO.MD';
    git: 'git status --short';
    handoff: 'docs/verification/HANDOFF-LATEST.MD';
    readiness: 'docs/verification/V2-READINESS-STATUS.MD';
    projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json';
  };
}
```

`v2/eval/workflow/detector.ts`

```ts
import type { WorkflowSourceSnapshot, WorkflowStateReport } from './types';

function buildBaseReport(snapshot: WorkflowSourceSnapshot): WorkflowStateReport {
  return {
    timestamp: snapshot.timestamp,
    state: 'ready_to_develop',
    reason: 'workspace is classified and no higher-priority workflow action is required',
    currentFocus: snapshot.currentFocus,
    dirtyHotspots: snapshot.dirtyHotspots,
    requiredActions: [],
    recommendedCommand: 'none',
    artifacts: snapshot.latestArtifacts,
    derivedFrom: {
      todo: 'TODO.MD',
      git: 'git status --short',
      handoff: 'docs/verification/HANDOFF-LATEST.MD',
      readiness: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
    },
  };
}

export function detectWorkflowState(snapshot: WorkflowSourceSnapshot): WorkflowStateReport {
  const report = buildBaseReport(snapshot);

  if (snapshot.readiness.latestVerifyFailed || snapshot.dirtySummary.hasUnknownChanges) {
    return {
      ...report,
      state: 'blocked',
      reason: snapshot.readiness.latestVerifyFailed
        ? 'latest verification failed and workflow cannot safely continue'
        : `unknown high-risk dirty files detected: ${snapshot.dirtySummary.unknownFiles.join(', ')}`,
      recommendedCommand: 'npm run workflow:check',
      requiredActions: snapshot.readiness.latestVerifyFailed
        ? ['修复最近一次验证失败', '重新运行 workflow 判定']
        : ['确认未知变更影响范围', '将未知高风险变更归类后再继续'],
    };
  }

  if (!snapshot.latestArtifacts.workflowFresh || !snapshot.latestArtifacts.handoffFresh || !snapshot.latestArtifacts.projectContextPath) {
    return {
      ...report,
      state: 'resume_needed',
      reason: 'workflow or handoff artifacts are missing/stale for the current session',
      recommendedCommand: 'npm run workflow:resume',
      requiredActions: ['刷新 workflow / handoff 现场', '重新确认当前重点与下一步'],
    };
  }

  if (snapshot.dirtySummary.hasRuntimeChanges || !snapshot.readiness.coreReady) {
    return {
      ...report,
      state: 'verification_needed',
      reason: 'runtime files changed or minimal verify gate is not green',
      recommendedCommand: 'npm run workflow:verify',
      requiredActions: ['运行最小必要验证', '确认 core gate 恢复为通过'],
    };
  }

  if (snapshot.readiness.needsStatusRefresh || !snapshot.latestArtifacts.readinessFresh) {
    return {
      ...report,
      state: 'status_refresh_needed',
      reason: 'derived status views are stale compared with the current workspace state',
      recommendedCommand: 'npm run workflow:refresh',
      requiredActions: ['刷新 readiness 状态页', '写回 workflow 最新状态'],
    };
  }

  if (snapshot.dirtySummary.hasDocsChanges) {
    return {
      ...report,
      state: 'handoff_ready',
      reason: 'documentation-facing changes are present and the workspace is ready for handoff refresh',
      recommendedCommand: 'npm run workflow:handoff',
      requiredActions: ['刷新 handoff 快照', '确认下一 session 的推荐动作'],
    };
  }

  return report;
}
```

- [ ] **Step 4: 重新运行测试，确认状态判定通过**

Run: `./node_modules/.bin/tsx --test v2/tests/workflow-detector.test.ts`

Expected: PASS，输出包含 `3 tests` 和 `0 failures`。

- [ ] **Step 5: Commit**

```bash
git add v2/eval/workflow/types.ts v2/eval/workflow/detector.ts v2/tests/workflow-detector.test.ts
git commit -m "feat: add workflow state detector"
```

---

### Task 2: 抽共享状态源，并让 handoff / workflow 复用同一套现场读取逻辑

**Files:**
- Create: `v2/eval/workflow/source-snapshot.ts`
- Modify: `v2/eval/runners/project-context-status.ts`
- Test: `v2/tests/workflow-detector.test.ts`

- [ ] **Step 1: 先补失败测试，锁定 dirty 分类与 artifact 读取行为**

在 `v2/tests/workflow-detector.test.ts` 追加以下测试：

```ts
import { classifyDirtyFiles, summarizeWorkflowSources } from '../eval/workflow/source-snapshot';

test('classifyDirtyFiles 能把 runtime、docs、unknown 变更分开', () => {
  const summary = classifyDirtyFiles([
    { status: 'M', file: 'v2/eval/runners/project-context-status.ts' },
    { status: 'M', file: 'README.MD' },
    { status: 'M', file: 'scripts/custom/manual.sh' },
  ]);

  assert.equal(summary.hasRuntimeChanges, true);
  assert.equal(summary.hasDocsChanges, true);
  assert.equal(summary.hasUnknownChanges, true);
  assert.deepEqual(summary.unknownFiles, ['scripts/custom/manual.sh']);
});

test('summarizeWorkflowSources 在缺少 workflow 状态文件时返回 workflowFresh=false', () => {
  const snapshot = summarizeWorkflowSources({
    root: process.cwd(),
    todoContent: '| 当前重点 | workflow |
',
    dirtyFiles: [],
    readiness: {
      available: true,
      currentStage: '进行中',
      acceptanceStatus: '进行中',
      coreReady: true,
      baselineReady: false,
      compareReady: false,
      fullReady: false,
      latestVerifyFailed: false,
      needsStatusRefresh: false,
    },
    latestArtifacts: {
      handoffPath: 'docs/verification/HANDOFF-LATEST.MD',
      readinessPath: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContextPath: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      workflowStatusPath: '',
      comparePath: 'v2/eval/reports/COMPARE-LATEST.json',
      replayPath: 'eval/reports/REPLAY-LATEST.json',
      handoffFresh: true,
      readinessFresh: true,
      workflowFresh: false,
    },
  });

  assert.equal(snapshot.latestArtifacts.workflowFresh, false);
  assert.equal(snapshot.currentFocus, 'workflow');
});
```

- [ ] **Step 2: 运行测试，确认当前缺少 source-snapshot 实现而失败**

Run: `./node_modules/.bin/tsx --test v2/tests/workflow-detector.test.ts`

Expected: FAIL，报错包含 `Cannot find module '../eval/workflow/source-snapshot'`。

- [ ] **Step 3: 实现共享状态源，并把 `project-context-status.ts` 改成调用它**

`v2/eval/workflow/source-snapshot.ts`

```ts
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type {
  WorkflowDirtySummary,
  WorkflowReadinessSnapshot,
  WorkflowSourceSnapshot,
  WorkflowLatestArtifacts,
} from './types';

export interface WorkflowSourceInput {
  root: string;
  todoContent: string;
  dirtyFiles: Array<{ status: string; file: string }>;
  readiness: WorkflowReadinessSnapshot;
  latestArtifacts: WorkflowLatestArtifacts;
}

export function tryLatestFile(directory: string, pattern: RegExp): string | null {
  if (!fs.existsSync(directory)) {
    return null;
  }

  const matches = fs.readdirSync(directory).filter((file) => pattern.test(file)).sort();
  return matches.length === 0 ? null : path.join(directory, matches[matches.length - 1]);
}

export function safeExec(root: string, command: string): string {
  try {
    return String(execSync(command, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' })).trimEnd();
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error
      ? String((error as { stderr?: string }).stderr || '').trimEnd()
      : '';
    return stderr;
  }
}

export function parseDirtyFiles(statusOutput: string): Array<{ status: string; file: string }> {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim() || line.slice(0, 2),
      file: line.slice(3).trim(),
    }))
    .filter((item) => !item.file.startsWith('.codebuddy/'));
}

export function classifyDirtyFiles(dirtyFiles: Array<{ status: string; file: string }>): WorkflowDirtySummary {
  const hasRuntimeChanges = dirtyFiles.some((item) => item.file.startsWith('v2/') || item.file.startsWith('scripts/test/') || item.file === 'package.json' || item.file === 'Makefile');
  const hasDocsChanges = dirtyFiles.some((item) => item.file.startsWith('docs/verification/') || item.file.startsWith('docs/superpowers/') || item.file === 'README.MD' || item.file === 'LOCAL-DEV-GUIDE.MD' || item.file === 'TODO.MD' || item.file === 'CHANGELOG.MD');
  const unknownFiles = dirtyFiles
    .map((item) => item.file)
    .filter((file) => !file.startsWith('v2/') && !file.startsWith('scripts/test/') && !file.startsWith('docs/') && file !== 'package.json' && file !== 'Makefile' && file !== 'README.MD' && file !== 'LOCAL-DEV-GUIDE.MD' && file !== 'TODO.MD' && file !== 'CHANGELOG.MD');

  return {
    hasRuntimeChanges,
    hasDocsChanges,
    hasUnknownChanges: unknownFiles.length > 0,
    unknownFiles,
  };
}

export function extractTodoCurrentFocus(todoContent: string): string {
  const match = todoContent.match(/\|\s*当前重点\s*\|\s*(.+?)\s*\|/u);
  return match?.[1]?.trim() || '未在 `TODO.MD` 中显式标注当前重点';
}

export function extractOpenTodoItems(todoContent: string, limit = 5): string[] {
  const match = todoContent.match(/## 下一阶段待办（按需推进）([\s\S]*?)(?:\n### 已决策暂缓|\n## 已完成|$)/u);
  const section = match?.[1] || todoContent;
  return Array.from(new Set(section
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const item = line.match(/^- \[ \] (.+)$/u);
      return item ? [item[1].trim()] : [];
    }))).slice(0, limit);
}

export function summarizeWorkflowSources(input: WorkflowSourceInput): WorkflowSourceSnapshot {
  return {
    timestamp: new Date().toISOString(),
    currentFocus: extractTodoCurrentFocus(input.todoContent),
    openTodos: extractOpenTodoItems(input.todoContent),
    dirtyFiles: input.dirtyFiles,
    dirtyHotspots: input.dirtyFiles.length === 0
      ? []
      : input.dirtyFiles.slice(0, 6).map((item) => `${item.status} ${item.file}`),
    dirtySummary: classifyDirtyFiles(input.dirtyFiles),
    latestArtifacts: input.latestArtifacts,
    readiness: input.readiness,
    previousWorkflow: null,
  };
}
```

把 `v2/eval/runners/project-context-status.ts` 中以下逻辑替换为共享 import：

```ts
import {
  parseDirtyFiles,
  safeExec,
  summarizeWorkflowSources,
  tryLatestFile,
} from '../workflow/source-snapshot';
```

并将原来的：

- `tryLatestFile(...)`
- `safeExec(...)`
- `parseDirtyFiles(...)`
- `extractTodoCurrentFocus(...)`
- `extractOpenTodoItems(...)`
- `buildDirtyFileHotspots(...)`

替换为通过 `summarizeWorkflowSources(...)` 计算 `currentFocus / openTodos / dirtyHotspots / dirtySummary`，然后继续生成现有 `ProjectContextReport`。

- [ ] **Step 4: 重新运行测试，并确认 handoff 生成器仍能通过类型检查**

Run: `./node_modules/.bin/tsx --test v2/tests/workflow-detector.test.ts && ./node_modules/.bin/tsc -p v2/tsconfig.json --noEmit`

Expected: PASS，且 `tsc` 无新增错误。

- [ ] **Step 5: Commit**

```bash
git add v2/eval/workflow/source-snapshot.ts v2/eval/runners/project-context-status.ts v2/tests/workflow-detector.test.ts
git commit -m "refactor: share workflow source snapshot logic"
```

---

### Task 3: 实现 Workflow writer / presenter / action runner / CLI runner

**Files:**
- Create: `v2/eval/workflow/presenter.ts`
- Create: `v2/eval/workflow/actions.ts`
- Create: `v2/eval/runners/workflow.ts`
- Test: `v2/tests/workflow-runner.test.ts`

- [ ] **Step 1: 写失败测试，锁定动作映射、写盘和输出格式**

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildWorkflowCommandPlan } from '../eval/workflow/actions';
import { formatWorkflowSummary } from '../eval/workflow/presenter';
import { writeWorkflowStatusReport } from '../eval/runners/workflow';
import type { WorkflowStateReport } from '../eval/workflow/types';

function buildReport(overrides: Partial<WorkflowStateReport> = {}): WorkflowStateReport {
  return {
    timestamp: '2026-03-30T15:40:00.000Z',
    state: 'status_refresh_needed',
    reason: 'derived status views are stale compared with the current workspace state',
    currentFocus: 'workflow orchestrator 落地',
    dirtyHotspots: ['M README.MD'],
    requiredActions: ['刷新 readiness 状态页', '写回 workflow 最新状态'],
    recommendedCommand: 'npm run workflow:refresh',
    artifacts: {
      handoffPath: 'docs/verification/HANDOFF-LATEST.MD',
      readinessPath: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContextPath: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      workflowStatusPath: 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json',
      comparePath: 'v2/eval/reports/COMPARE-LATEST.json',
      replayPath: 'eval/reports/REPLAY-LATEST.json',
      handoffFresh: false,
      readinessFresh: false,
      workflowFresh: false,
    },
    derivedFrom: {
      todo: 'TODO.MD',
      git: 'git status --short',
      handoff: 'docs/verification/HANDOFF-LATEST.MD',
      readiness: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
    },
    ...overrides,
  };
}

test('buildWorkflowCommandPlan 为 handoff 返回 status 再 handoff 的串行计划', () => {
  const commands = buildWorkflowCommandPlan('handoff', buildReport({ state: 'handoff_ready', recommendedCommand: 'npm run workflow:handoff' }));
  assert.deepEqual(commands, ['npm run runtime:status', 'npm run runtime:handoff']);
});

test('formatWorkflowSummary 输出唯一推荐下一步和原因', () => {
  const summary = formatWorkflowSummary(buildReport());
  assert.match(summary, /当前状态: status_refresh_needed/);
  assert.match(summary, /推荐命令: npm run workflow:refresh/);
  assert.match(summary, /原因: derived status views are stale/);
});

test('writeWorkflowStatusReport 会写 latest 与时间戳快照', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-report-'));
  const latestPath = writeWorkflowStatusReport(dir, buildReport());
  const latest = JSON.parse(fs.readFileSync(latestPath, 'utf-8')) as WorkflowStateReport;

  assert.equal(path.basename(latestPath), 'WORKFLOW-STATUS-LATEST.json');
  assert.equal(latest.state, 'status_refresh_needed');
  assert.ok(fs.readdirSync(dir).some((file) => /^WORKFLOW-STATUS-\d{8}T\d{6}Z\.json$/i.test(file)));
});
```

- [ ] **Step 2: 运行测试，确认 presenter/actions/runner 还不存在**

Run: `./node_modules/.bin/tsx --test v2/tests/workflow-runner.test.ts`

Expected: FAIL，报错包含缺少 `buildWorkflowCommandPlan`、`formatWorkflowSummary` 或 `writeWorkflowStatusReport`。

- [ ] **Step 3: 先实现纯函数，再补 runner 的写盘逻辑**

`v2/eval/workflow/actions.ts`

```ts
import type { WorkflowStateReport } from './types';

export type WorkflowAction = 'check' | 'resume' | 'verify' | 'refresh' | 'handoff';

export function buildWorkflowCommandPlan(action: WorkflowAction, report: WorkflowStateReport): string[] {
  if (action === 'check' || action === 'resume') {
    return [];
  }

  if (action === 'verify') {
    return ['npm run runtime:verify:core'];
  }

  if (action === 'refresh') {
    return ['npm run runtime:status'];
  }

  if (action === 'handoff') {
    return report.state === 'handoff_ready' || report.state === 'status_refresh_needed'
      ? ['npm run runtime:status', 'npm run runtime:handoff']
      : ['npm run runtime:handoff'];
  }

  return [];
}
```

`v2/eval/workflow/presenter.ts`

```ts
import type { WorkflowStateReport } from './types';

export function formatWorkflowSummary(report: WorkflowStateReport): string {
  const required = report.requiredActions.length > 0 ? report.requiredActions.join('；') : '无';
  const hotspots = report.dirtyHotspots.length > 0 ? report.dirtyHotspots.join('；') : '无';

  return [
    '## Workflow 状态',
    '',
    `- 当前状态: ${report.state}`,
    `- 当前重点: ${report.currentFocus}`,
    `- 原因: ${report.reason}`,
    `- 当前改动热点: ${hotspots}`,
    `- 必需动作: ${required}`,
    `- 推荐命令: ${report.recommendedCommand}`,
  ].join('\n');
}
```

`v2/eval/runners/workflow.ts`

```ts
import fs from 'fs';
import path from 'path';
import { detectWorkflowState } from '../workflow/detector';
import { summarizeWorkflowSources } from '../workflow/source-snapshot';
import { buildWorkflowCommandPlan, type WorkflowAction } from '../workflow/actions';
import { formatWorkflowSummary } from '../workflow/presenter';
import type { WorkflowReadinessSnapshot, WorkflowStateReport } from '../workflow/types';

function repoRoot(): string {
  return path.resolve(__dirname, '../../..');
}

function timestampLabel(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function writeWorkflowStatusReport(reportsDir: string, report: WorkflowStateReport): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const latestPath = path.join(reportsDir, 'WORKFLOW-STATUS-LATEST.json');
  const timestampPath = path.join(reportsDir, `WORKFLOW-STATUS-${timestampLabel()}.json`);
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(timestampPath, JSON.stringify(report, null, 2));
  return latestPath;
}

function parseAction(argv: string[]): WorkflowAction {
  const requested = argv[2]?.replace(/^--action=/, '') || 'check';
  if (requested === 'resume' || requested === 'verify' || requested === 'refresh' || requested === 'handoff') {
    return requested;
  }
  return 'check';
}

function buildFallbackReadiness(): WorkflowReadinessSnapshot {
  return {
    available: false,
    currentStage: '待刷新 workflow/readiness 基线',
    acceptanceStatus: '未知',
    coreReady: false,
    baselineReady: false,
    compareReady: false,
    fullReady: false,
    latestVerifyFailed: false,
    needsStatusRefresh: true,
  };
}

async function main(): Promise<void> {
  const root = repoRoot();
  const action = parseAction(process.argv);
  const todoContent = fs.readFileSync(path.join(root, 'TODO.MD'), 'utf-8');
  const snapshot = summarizeWorkflowSources({
    root,
    todoContent,
    dirtyFiles: [],
    readiness: buildFallbackReadiness(),
    latestArtifacts: {
      handoffPath: 'docs/verification/HANDOFF-LATEST.MD',
      readinessPath: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContextPath: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      workflowStatusPath: 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json',
      comparePath: 'v2/eval/reports/COMPARE-LATEST.json',
      replayPath: 'eval/reports/REPLAY-LATEST.json',
      handoffFresh: false,
      readinessFresh: false,
      workflowFresh: false,
    },
  });
  const report = detectWorkflowState(snapshot);
  writeWorkflowStatusReport(path.join(root, 'v2/eval/reports'), report);
  const commands = buildWorkflowCommandPlan(action, report);

  console.log(formatWorkflowSummary(report));
  if (commands.length > 0) {
    console.log('');
    console.log(`后续执行计划: ${commands.join(' -> ')}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: 运行测试，确认纯函数、写盘与 CLI 输出都通过**

Run: `./node_modules/.bin/tsx --test v2/tests/workflow-runner.test.ts`

Expected: PASS，输出包含 `3 tests` 和 `0 failures`。

- [ ] **Step 5: Commit**

```bash
git add v2/eval/workflow/presenter.ts v2/eval/workflow/actions.ts v2/eval/runners/workflow.ts v2/tests/workflow-runner.test.ts
git commit -m "feat: add workflow runner and report writer"
```

---

### Task 4: 接入 `package.json` / `Makefile` 命令面，并完成 CLI 冒烟

**Files:**
- Modify: `package.json`
- Modify: `Makefile`
- Test: `v2/tests/workflow-runner.test.ts`

- [ ] **Step 1: 先执行命令，确认当前还没有 `workflow:*` 脚本**

Run: `npm run workflow:check`

Expected: FAIL，输出包含 `Missing script: "workflow:check"`。

- [ ] **Step 2: 在 `package.json` 中增加 workflow 脚本组**

将 `package.json` 的 `scripts` 段补成：

```json
{
  "scripts": {
    "runtime:test": "npm run v2:test",
    "runtime:smoke": "npm run v2:smoke",
    "runtime:replay": "npm run v2:replay",
    "runtime:compare": "npm run v2:compare",
    "runtime:verify": "npm run v2:verify:core",
    "runtime:verify:core": "npm run v2:verify:core",
    "runtime:verify:full": "npm run v2:verify:full",
    "runtime:status": "npm run v2:status",
    "runtime:handoff": "npm run v2:handoff",
    "runtime:context": "npm run v2:context",
    "workflow": "tsx v2/eval/runners/workflow.ts --action=check",
    "workflow:resume": "tsx v2/eval/runners/workflow.ts --action=resume",
    "workflow:check": "tsx v2/eval/runners/workflow.ts --action=check",
    "workflow:verify": "tsx v2/eval/runners/workflow.ts --action=verify",
    "workflow:refresh": "tsx v2/eval/runners/workflow.ts --action=refresh",
    "workflow:handoff": "tsx v2/eval/runners/workflow.ts --action=handoff",
    "v2:test": "tsx --test v2/tests/runtime-regression.test.ts"
  }
}
```

- [ ] **Step 3: 在 `Makefile` 里增加帮助说明和包装 target**

在 `.PHONY` 与帮助段新增：

```make
.PHONY: workflow workflow-resume workflow-check workflow-verify workflow-refresh workflow-handoff

help:
	@echo "Workflow 编排："
	@echo "  make workflow-check   # 只读计算当前 workflow 状态"
	@echo "  make workflow-resume  # 新 session / 续接入口"
	@echo "  make workflow-verify  # 执行 workflow 选定的最小验证动作"
	@echo "  make workflow-refresh # 刷新 workflow/readiness 状态视图"
	@echo "  make workflow-handoff # 生成最新 handoff 快照与 workflow 状态"

workflow:
	@cd $(ROOT) && npm run workflow

workflow-resume:
	@cd $(ROOT) && npm run workflow:resume

workflow-check:
	@cd $(ROOT) && npm run workflow:check

workflow-verify:
	@cd $(ROOT) && npm run workflow:verify

workflow-refresh:
	@cd $(ROOT) && npm run workflow:refresh

workflow-handoff:
	@cd $(ROOT) && npm run workflow:handoff
```

- [ ] **Step 4: 跑命令冒烟，确认 workflow 入口已接通**

Run: `npm run workflow:check && make workflow-check`

Expected: PASS，两条命令都打印 `## Workflow 状态`，且包含 `当前状态:` 和 `推荐命令:`。

- [ ] **Step 5: Commit**

```bash
git add package.json Makefile
git commit -m "feat: wire workflow command surface"
```

---

### Task 5: 更新开发文档与验收说明，完成最终回归

**Files:**
- Modify: `README.MD`
- Modify: `LOCAL-DEV-GUIDE.MD`
- Modify: `docs/verification/HANDOFF-PROTOCOL.MD`
- Modify: `docs/verification/VERIFICATION.MD`
- Modify: `docs/DOCS-INDEX.MD`
- Modify: `CHANGELOG.MD`
- Test: `v2/tests/workflow-detector.test.ts`
- Test: `v2/tests/workflow-runner.test.ts`

- [ ] **Step 1: 先搜索旧入口描述，确认文档还没有 workflow 主入口说明**

Run: `rg -n "runtime:handoff|runtime:status|workflow:" README.MD LOCAL-DEV-GUIDE.MD docs/verification/HANDOFF-PROTOCOL.MD docs/verification/VERIFICATION.MD docs/DOCS-INDEX.MD CHANGELOG.MD`

Expected: 能看到大量 `runtime:*` 说明，但 `workflow:*` 仅出现在规格/计划文档中，还没有现行使用说明。

- [ ] **Step 2: 更新 `README.MD` 与 `LOCAL-DEV-GUIDE.MD` 的默认开发入口**

`README.MD` 新增/替换为：

```md
### 3. 日常开发续接（推荐）

```bash
npm run workflow:resume
npm run workflow:check
```

默认规则：

- `workflow:*` 是开发流程决策层入口
- `runtime:*` 继续保留为底层执行层
- `docs/verification/HANDOFF-LATEST.MD` 与 `docs/verification/V2-READINESS-STATUS.MD` 是派生视图，不再作为并列决策入口
```

`LOCAL-DEV-GUIDE.MD` 新增：

```md
## Workflow 编排入口（新增）

- `npm run workflow:resume`：新 session 先看什么、当前状态是什么、唯一下一步是什么
- `npm run workflow:check`：只读判定当前 workflow state
- `npm run workflow:verify`：按最小必要验证矩阵触发底层 `runtime:*`
- `npm run workflow:refresh`：刷新 workflow/readiness 派生状态
- `npm run workflow:handoff`：生成最新 handoff 与 workflow 机读状态
```
```

- [ ] **Step 3: 更新 protocol / verification / index / changelog**

`docs/verification/HANDOFF-PROTOCOL.MD` 增加：

```md
## 0. 与 workflow 的职责分层

- `workflow:*` 负责流程决策：当前状态、当前原因、唯一推荐下一步
- `runtime:*` 负责底层执行：verify / readiness / handoff 生成
- `HANDOFF-LATEST.MD` 继续是给人看的派生视图
- `V2-READINESS-STATUS.MD` 继续是详细状态页
```

`docs/verification/VERIFICATION.MD` 增加：

```md
## Workflow 最小必要验证矩阵

- runtime / replay / tests 改动：先跑 `npm run workflow:verify`
- 仅文档 / handoff / status 改动：先跑 `npm run workflow:refresh` 或 `npm run workflow:handoff`
- compare 观察层改动：在 core gate 之外按需补 `npm run runtime:compare`
```

`docs/DOCS-INDEX.MD` 增加：

```md
## Superpowers / 计划
- `docs/superpowers/plans/2026-03-30-WORKFLOW-ORCHESTRATOR-IMPLEMENTATION-PLAN.MD` - workflow orchestrator 实现计划（共享状态源、状态机、CLI runner、命令接线与文档迁移）
```

`CHANGELOG.MD` 增加：

```md
### 🛠️ Workflow Orchestrator 实现计划（2026-03-30）

- **新增计划**: 新增 `docs/superpowers/plans/2026-03-30-WORKFLOW-ORCHESTRATOR-IMPLEMENTATION-PLAN.MD`，将 workflow orchestrator 规格拆分为可执行实现任务。
- **落地范围**: 明确共享状态源、状态判定器、writer/presenter、CLI runner、`package.json` / `Makefile` 命令面与文档迁移步骤。
```

- [ ] **Step 4: 跑最终回归与命令冒烟，确认计划对应的最小实现闭环**

Run:

```bash
./node_modules/.bin/tsx --test v2/tests/workflow-detector.test.ts
./node_modules/.bin/tsx --test v2/tests/workflow-runner.test.ts
./node_modules/.bin/tsc -p v2/tsconfig.json --noEmit
npm run workflow:check
npm run workflow:resume
```

Expected:

- 两个测试文件 PASS
- `tsc` 无错误
- `workflow:check` / `workflow:resume` 都打印当前状态与推荐命令

- [ ] **Step 5: Commit**

```bash
git add README.MD LOCAL-DEV-GUIDE.MD docs/verification/HANDOFF-PROTOCOL.MD docs/verification/VERIFICATION.MD docs/DOCS-INDEX.MD CHANGELOG.MD
git commit -m "docs: document workflow orchestrator entrypoints"
```

---

## Self-Review

### Spec coverage

- **状态机**：Task 1
- **单一机读流程事实源**：Task 3
- **共享状态源 / dirty 分类 / TODO 读取**：Task 2
- **统一命令面 `workflow:*`**：Task 3 + Task 4
- **迁移为“workflow 决策层 + runtime 执行层 + 展示视图”**：Task 3 + Task 5
- **测试与验收策略**：Task 1 / 3 / 5 的测试步骤
- **文档与索引同步**：Task 5

无 spec gap。

### Placeholder scan

已检查：

- 没有 `TBD` / `TODO` / `implement later`
- 每个任务都给出具体文件、代码块和命令
- 没有“参考上一个任务”的省略写法

### Type consistency

已统一使用以下命名：

- `WorkflowState`
- `WorkflowStateReport`
- `WorkflowSourceSnapshot`
- `WorkflowAction`
- `detectWorkflowState`
- `buildWorkflowCommandPlan`
- `formatWorkflowSummary`
- `writeWorkflowStatusReport`

后续实现时不要把这些名字改成别的变体。
