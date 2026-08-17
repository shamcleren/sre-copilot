# SRE Copilot Pi Core Minimal Phase 1 Implementation Plan

> **For agentic workers:** 本计划由人手动执行；每个 task 只完成一小块可运行核心，执行后暂停检查。不要自动委派 subagent。步骤使用 checkbox（`- [ ]`）跟踪。

**Goal:** 在干净基线上实现一个最小、可读、可离线验证的 `demo-service` 5xx 告警受控写入核心；Pi 只保留接入边界，不在本阶段安装或接线。

**Architecture:** `agent/` 只包含合同、计划构建、fake adapter、确定性 policy 和一个线性的 `SreCore` facade。主流程是“读取当前告警 → 生成计划 → 预览 diff → 人工确认 → fake 写入 → 复验 → 返回审计摘要”。先不实现复杂状态机、回滚、持久化、并发恢复和真实平台 adapter；这些边界在核心 happy path 稳定后另开小计划。

**Tech Stack:** TypeScript 5.9、Node.js 20+、ESM、`tsx`、Node `node:test`、Node `crypto`；不新增运行时第三方依赖，不连接网络或真实监控。

---

## Working agreement

- 第一条命令必须是 `npm run clean:start:verify`；失败就停，不创建 `agent/` 绕过门禁。
- 每个 task 按“写一个失败测试 → 最小实现 → 定向验证 → 提交”执行，完成后等待人工确认。
- 代码优先保持同步、直线和显式；不要为了未来场景提前引入依赖注入框架、事件总线、repository 抽象或通用工作流引擎。
- v0 只支持一个 `ActionStep`、一个 fake alert adapter、一个进程内内存 store 和一个确认人。
- 边界条件必须在文档末尾列为后续独立事项，不在 v0 代码里留下未实现的空函数或假成功分支。

## Official references

实现时优先阅读以下官方资料；链接只用于确认 API 和约束，不复制上游文档：

| 主题 | 地址 | 本计划使用点 |
|---|---|---|
| Pi coding-agent 扩展 | <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md> | 后续 `.pi/extensions/`、`ExtensionAPI`、`registerTool`、`ctx.ui.confirm` 接入边界 |
| Pi monorepo/package 入口 | <https://github.com/badlogic/pi-mono> | 确认包名、版本和官方源码位置；本阶段不安装 |
| TypeScript `tsconfig.json` | <https://www.typescriptlang.org/docs/handbook/tsconfig-json> | `agent/tsconfig.json` 的项目边界和严格编译入口 |
| TypeScript 函数与对象类型 | <https://www.typescriptlang.org/docs/handbook/2/everyday-types.html> | 函数参数、返回值、联合类型和最小合同 |
| Node.js stable test runner | <https://nodejs.org/download/release/v20.15.0/docs/api/test.html> | `node:test`/`tsx --test` 的离线测试组织方式 |
| Node.js SHA-256 | <https://nodejs.org/api/crypto.html#createhashalgorithm-options> | 计划指纹 `hashAlertPlan` 的最小实现 |

如果 Pi 官方文档的包名、事件名或结果类型已经变化，先更新本计划中的接入备注；不要凭记忆安装一个近似包。

## Scope

### v0 要交付

1. `CreateAlertInput`、`AlertRule`、`AlertPlan`、`Approval`、`AuditEvent` 等最小类型。
2. `createAlertPlan` 和 `summarizeAlertDiff` 两个纯函数。
3. `FakeAlertAdapter` 的 `inspect/create/verify` 三个方法。
4. `decideAlertPlan` 和 `hashAlertPlan` 两个确定性函数。
5. `createSreCore` facade 的 `proposeAlert/previewAlert/approveAlert/executeAlert` 四个公开方法。
6. 6 个左右的离线测试，覆盖新建告警、确认、成功复验和复验失败。

### v0 明确不做

- 真实 BK Monitor、Prometheus、Kubernetes、SSH、Git、CI/CD、企微、Web API 和 Pi extension。
- 多步骤 DAG、复杂状态机、分布式锁、数据库、队列、跨进程恢复、租约续期和自动 rollback。
- 多租户 RBAC、复杂风险矩阵、动态 TTL、幂等冲突恢复、审计持久化和敏感字段递归脱敏。
- 让 LLM 直接调用 adapter；后续 Pi tool 只能调用 `agent/src/index.ts` facade。

---

## Directory map

Phase 1 只创建以下文件。每个文件只承担一个职责，先不要扩展目录：

```text
agent/
├── package.json                 # 仅声明 agent 包是 ESM/private，不添加运行时依赖
├── tsconfig.json                # agent/src 与 agent/tests 的严格 TypeScript 边界
├── src/
│   ├── contracts.ts             # 所有 v0 输入、输出、状态和 port 类型
│   ├── alert-plan.ts            # 告警计划构建、目标规则和 diff 纯函数
│   ├── fake-alert-adapter.ts    # 进程内 fake 告警存储和 observe/create/verify
│   ├── plan-policy.ts           # v0 只有“新建需要人工确认”的确定性判断
│   ├── alert-core.ts            # SreCore facade、内存 store 和线性执行流程
│   └── index.ts                 # 唯一公开导出；未来 Pi 只从这里调用
└── tests/
    ├── support/fixtures.ts     # 固定输入、actor、时钟和 fake adapter
    ├── alert-plan.test.ts       # 计划和 diff 纯函数
    └── alert-core.test.ts       # facade 主流程和复验失败
```

### Naming contract

| 文件 | 函数/类 | 职责 | 不负责 |
|---|---|---|---|
| `contracts.ts` | `CreateAlertInput`、`AlertRule`、`AlertPlan`、`AlertAdapter` | 只定义数据和 port | 不实现业务流程 |
| `alert-plan.ts` | `buildAlertRule`、`summarizeAlertDiff`、`createAlertPlan` | 从结构化输入得到目标和计划 | 不读 store、不写 adapter |
| `fake-alert-adapter.ts` | `FakeAlertAdapter.inspect`、`.create`、`.verify` | 模拟一个告警资源 | 不决定是否需要确认 |
| `plan-policy.ts` | `decideAlertPlan`、`hashAlertPlan` | 计算是否允许和计划指纹 | 不执行写入 |
| `alert-core.ts` | `createSreCore`、`proposeAlert`、`previewAlert`、`approveAlert`、`executeAlert` | 编排 v0 直线流程 | 不暴露底层 adapter 给调用方 |
| `index.ts` | `createCore` | 稳定公开 facade | 不导出 fake adapter 内部 store |

命名规则：纯函数使用动词开头；创建器用 `create`；构建结构用 `build`；比较只用 `summarize`；外部写入只允许出现在 adapter 的 `create` 方法。

---

### Task 0: Re-check clean baseline

**Files:** None

- [ ] **Step 1: Run the mandatory gate**

Run:

```bash
npm run clean:start:verify
git status --short --branch
```

Expected: `clean-start verification: PASS`，分支是 `codex/pi-sre-core`，工作树干净。

- [ ] **Step 2: Verify the implementation surface is empty**

Run:

```bash
test ! -e agent
test ! -e .pi
```

Expected: 两条命令退出 0；本计划从空的 `agent/` 开始。

- [ ] **Step 3: Commit nothing and stop**

Task 0 只验证基线，不改文件。确认通过后再进入 Task 1。

---

### Task 1: Create the minimal package boundary and contracts

**Files:**
- Create: `agent/package.json`
- Create: `agent/tsconfig.json`
- Create: `agent/src/contracts.ts`
- Create: `agent/tests/support/fixtures.ts`
- Create: `agent/tests/alert-plan.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract test**

`agent/tests/alert-plan.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlertPlan } from '../src/alert-plan.js';
import { demoAlertInput } from './support/fixtures.js';

test('creates a plan-shaped object for a demo service alert', () => {
  const plan = createAlertPlan(demoAlertInput, null);
  assert.equal(plan.operation, 'alert.create');
  assert.equal(plan.input.service, 'demo-service');
  assert.equal(plan.status, 'DRAFT');
  assert.equal(plan.diff.kind, 'add');
});
```

- [ ] **Step 2: Run the test to confirm the missing module**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/alert-plan.test.ts
```

Expected: FAIL with a missing `agent/src/alert-plan.ts` module.

- [ ] **Step 3: Add the package boundary and contracts**

`agent/package.json`

```json
{
  "name": "@sre-copilot/agent",
  "private": true,
  "type": "module"
}
```

`agent/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

`agent/src/contracts.ts`

```ts
export type PlanStatus =
  | 'DRAFT'
  | 'READY'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED';

export interface CreateAlertInput {
  service: string;
  alertName: string;
  query: string;
  threshold: number;
  windowMinutes: number;
}

export interface AlertRule {
  service: string;
  name: string;
  query: string;
  threshold: number;
  windowMinutes: number;
  enabled: boolean;
}

export interface AlertDiff {
  kind: 'add' | 'none';
  summary: string;
}

export interface AlertPlan {
  id: string;
  operation: 'alert.create';
  input: CreateAlertInput;
  current: AlertRule | null;
  desired: AlertRule;
  diff: AlertDiff;
  status: PlanStatus;
  planHash: string;
}

export interface Approval {
  id: string;
  planId: string;
  planHash: string;
  actorId: string;
}

export interface AuditEvent {
  type: 'PLAN_CREATED' | 'APPROVED' | 'EXECUTED' | 'VERIFIED' | 'FAILED';
  planId: string;
  message: string;
}

export interface AlertAdapter {
  inspect(service: string, alertName: string): Promise<AlertRule | null>;
  create(rule: AlertRule): Promise<AlertRule>;
  verify(rule: AlertRule): Promise<boolean>;
}
```

`agent/tests/support/fixtures.ts`

```ts
import type { CreateAlertInput } from '../../src/contracts.js';

export const demoAlertInput: CreateAlertInput = {
  service: 'demo-service',
  alertName: 'http-5xx-rate',
  query: 'http_requests_total{service="demo-service",status=~"5.."}',
  threshold: 0.05,
  windowMinutes: 5,
};
```

- [ ] **Step 4: Add root scripts for typecheck and focused tests**

Add to the root `package.json`:

```json
{
  "scripts": {
    "clean:start:verify": "bash scripts/test/verify-clean-start.sh",
    "agent:typecheck": "tsc -p agent/tsconfig.json --noEmit",
    "agent:test": "tsx --test agent/tests/*.test.ts",
    "agent:verify": "npm run clean:start:verify && npm run agent:typecheck && npm run agent:test"
  }
}
```

Keep the existing `name`, `private`, `type`, `engines` and devDependencies unchanged.

- [ ] **Step 5: Run typecheck and the focused test**

Run:

```bash
npm run agent:typecheck
./node_modules/.bin/tsx --test agent/tests/alert-plan.test.ts
```

Expected: TypeScript still fails because `alert-plan.ts` is not implemented; do not mark Task 1 complete until Task 2 supplies that file.

---

### Task 2: Implement the pure alert plan and fake adapter

**Files:**
- Create: `agent/src/alert-plan.ts`
- Create: `agent/src/fake-alert-adapter.ts`
- Modify: `agent/tests/alert-plan.test.ts`
- Create: `agent/tests/fake-alert-adapter.test.ts`

- [ ] **Step 1: Add the smallest pure plan implementation**

`agent/src/alert-plan.ts`

```ts
import type {
  AlertDiff,
  AlertPlan,
  AlertRule,
  CreateAlertInput,
} from './contracts.js';

export function buildAlertRule(input: CreateAlertInput): AlertRule {
  return {
    service: input.service,
    name: input.alertName,
    query: input.query,
    threshold: input.threshold,
    windowMinutes: input.windowMinutes,
    enabled: true,
  };
}

export function summarizeAlertDiff(
  current: AlertRule | null,
  desired: AlertRule,
): AlertDiff {
  if (!current) return { kind: 'add', summary: `create ${desired.name}` };
  return { kind: 'none', summary: `${desired.name} already exists` };
}

export function createAlertPlan(
  input: CreateAlertInput,
  current: AlertRule | null,
): AlertPlan {
  const desired = buildAlertRule(input);
  return {
    id: `alert:${input.service}:${input.alertName}`,
    operation: 'alert.create',
    input,
    current,
    desired,
    diff: summarizeAlertDiff(current, desired),
    status: 'DRAFT',
    planHash: '',
  };
}
```

- [ ] **Step 2: Add the fake adapter with one in-memory map**

`agent/src/fake-alert-adapter.ts`

```ts
import type { AlertAdapter, AlertRule } from './contracts.js';

export class FakeAlertAdapter implements AlertAdapter {
  private readonly rules = new Map<string, AlertRule>();

  async inspect(service: string, alertName: string): Promise<AlertRule | null> {
    return this.rules.get(`${service}:${alertName}`) ?? null;
  }

  async create(rule: AlertRule): Promise<AlertRule> {
    this.rules.set(`${rule.service}:${rule.name}`, rule);
    return rule;
  }

  async verify(rule: AlertRule): Promise<boolean> {
    return this.rules.get(`${rule.service}:${rule.name}`)?.name === rule.name;
  }
}
```

- [ ] **Step 3: Add focused tests for new and existing alerts**

`agent/tests/fake-alert-adapter.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeAlertAdapter } from '../src/fake-alert-adapter.js';
import { buildAlertRule } from '../src/alert-plan.js';
import { demoAlertInput } from './support/fixtures.js';

test('fake adapter starts empty and verifies a created rule', async () => {
  const adapter = new FakeAlertAdapter();
  const rule = buildAlertRule(demoAlertInput);
  assert.equal(await adapter.inspect(rule.service, rule.name), null);
  await adapter.create(rule);
  assert.equal(await adapter.verify(rule), true);
});

test('fake adapter can inspect the rule after creation', async () => {
  const adapter = new FakeAlertAdapter();
  const rule = buildAlertRule(demoAlertInput);
  await adapter.create(rule);
  assert.deepEqual(await adapter.inspect(rule.service, rule.name), rule);
});
```

Append this exact test to `agent/tests/alert-plan.test.ts`:

```ts
test('existing alert produces a noop diff', () => {
  const current = {
    service: demoAlertInput.service,
    name: demoAlertInput.alertName,
    query: demoAlertInput.query,
    threshold: demoAlertInput.threshold,
    windowMinutes: demoAlertInput.windowMinutes,
    enabled: true,
  };
  const plan = createAlertPlan(demoAlertInput, current);
  assert.equal(plan.diff.kind, 'none');
});
```

- [ ] **Step 4: Run the plan and adapter tests**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/alert-plan.test.ts agent/tests/fake-alert-adapter.test.ts
```

Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 5: Commit the pure functions and adapter**

```bash
git add agent package.json
git commit -m "feat(agent): add minimal alert plan and fake adapter"
```

---

### Task 3: Add deterministic policy, plan hash and linear core facade

**Files:**
- Create: `agent/src/plan-policy.ts`
- Create: `agent/src/alert-core.ts`
- Modify: `agent/src/alert-plan.ts`
- Create: `agent/tests/alert-core.test.ts`

- [ ] **Step 1: Write the failing happy-path test**

`agent/tests/alert-core.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeAlertAdapter } from '../src/fake-alert-adapter.js';
import { createSreCore } from '../src/alert-core.js';
import { demoAlertInput } from './support/fixtures.js';

test('core proposes, previews, approves, executes and verifies an alert', async () => {
  const core = createSreCore({ adapter: new FakeAlertAdapter() });
  const plan = await core.proposeAlert(demoAlertInput);
  assert.equal(plan.status, 'AWAITING_APPROVAL');
  assert.equal(core.previewAlert(plan.id).diff.kind, 'add');
  const approval = core.approveAlert(plan.id, 'renjinming');
  const result = await core.executeAlert(plan.id, approval.id);
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.audit.at(-1)?.type, 'VERIFIED');
});
```

- [ ] **Step 2: Implement the minimal policy and hash**

`agent/src/plan-policy.ts`

```ts
import { createHash } from 'node:crypto';
import type { AlertPlan } from './contracts.js';

export function decideAlertPlan(plan: AlertPlan): 'confirm' | 'noop' {
  return plan.diff.kind === 'add' ? 'confirm' : 'noop';
}

export function hashAlertPlan(plan: AlertPlan): string {
  const stable = JSON.stringify({
    operation: plan.operation,
    input: plan.input,
    desired: plan.desired,
    diff: plan.diff,
  });
  return createHash('sha256').update(stable).digest('hex');
}
```

Assign `plan.planHash = hashAlertPlan(plan)` after `createAlertPlan` returns. The plan status becomes `AWAITING_APPROVAL` only when `decideAlertPlan(plan) === 'confirm'`; an existing rule remains a visible `noop` and is not written.

- [ ] **Step 3: Implement the linear `SreCore` facade**

`agent/src/alert-core.ts`

```ts
import { createAlertPlan } from './alert-plan.js';
import { decideAlertPlan, hashAlertPlan } from './plan-policy.js';
import type {
  AlertAdapter,
  AlertPlan,
  Approval,
  AuditEvent,
  CreateAlertInput,
} from './contracts.js';

export interface SreCore {
  proposeAlert(input: CreateAlertInput): Promise<AlertPlan>;
  previewAlert(planId: string): AlertPlan;
  approveAlert(planId: string, actorId: string): Approval;
  executeAlert(planId: string, approvalId: string): Promise<{
    status: 'SUCCEEDED' | 'FAILED';
    audit: AuditEvent[];
  }>;
}

export function createSreCore({ adapter }: { adapter: AlertAdapter }): SreCore {
  const plans = new Map<string, AlertPlan>();
  const approvals = new Map<string, Approval>();
  const audits = new Map<string, AuditEvent[]>();

  function addAudit(planId: string, event: AuditEvent): void {
    audits.set(planId, [...(audits.get(planId) ?? []), event]);
  }

  return {
    async proposeAlert(input) {
      const current = await adapter.inspect(input.service, input.alertName);
      const plan = createAlertPlan(input, current);
      plan.planHash = hashAlertPlan(plan);
      plan.status = decideAlertPlan(plan) === 'confirm' ? 'AWAITING_APPROVAL' : 'READY';
      plans.set(plan.id, plan);
      addAudit(plan.id, { type: 'PLAN_CREATED', planId: plan.id, message: plan.diff.summary });
      return plan;
    },

    previewAlert(planId) {
      const plan = plans.get(planId);
      if (!plan) throw new Error(`unknown plan: ${planId}`);
      return plan;
    },

    approveAlert(planId, actorId) {
      const plan = this.previewAlert(planId);
      if (plan.status !== 'AWAITING_APPROVAL') throw new Error('plan does not require approval');
      const approval = { id: `approval:${planId}`, planId, planHash: plan.planHash, actorId };
      approvals.set(approval.id, approval);
      addAudit(planId, { type: 'APPROVED', planId, message: `approved by ${actorId}` });
      return approval;
    },

    async executeAlert(planId, approvalId) {
      const plan = this.previewAlert(planId);
      const approval = approvals.get(approvalId);
      if (!approval || approval.planId !== planId || approval.planHash !== plan.planHash) {
        throw new Error('approval does not match plan');
      }
      plan.status = 'EXECUTING';
      const audit: AuditEvent[] = audits.get(planId) ?? [];
      try {
        await adapter.create(plan.desired);
        addAudit(planId, { type: 'EXECUTED', planId, message: 'alert created' });
        if (!(await adapter.verify(plan.desired))) throw new Error('verification failed');
        plan.status = 'SUCCEEDED';
        addAudit(planId, { type: 'VERIFIED', planId, message: 'alert verified' });
        return { status: 'SUCCEEDED', audit: audits.get(planId) ?? audit };
      } catch (error) {
        plan.status = 'FAILED';
        addAudit(planId, { type: 'FAILED', planId, message: error instanceof Error ? error.message : String(error) });
        return { status: 'FAILED', audit: audits.get(planId) ?? audit };
      }
    },
  };
}
```

This is intentionally a straight-line v0 implementation. Do not add a generic state-machine class, event bus or repository interface around it.

- [ ] **Step 4: Add the verification-failure test**

Create a test adapter by extending `FakeAlertAdapter` and overriding `verify()` to return `false`. Assert that `executeAlert()` returns `status === 'FAILED'` and the last audit event is `FAILED`.

- [ ] **Step 5: Run the core tests**

Run:

```bash
npm run agent:typecheck
./node_modules/.bin/tsx --test agent/tests/alert-plan.test.ts agent/tests/fake-alert-adapter.test.ts agent/tests/alert-core.test.ts
```

Expected: PASS, 6 tests, 0 failures.

- [ ] **Step 6: Commit the core facade**

```bash
git add agent
git commit -m "feat(agent): add minimal alert execution core"
```

---

### Task 4: Export one public entry and document the future Pi boundary

**Files:**
- Create: `agent/src/index.ts`
- Modify: `agent/tests/alert-core.test.ts`
- Modify: `docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD`

- [ ] **Step 1: Add the only public export**

`agent/src/index.ts`

```ts
export { createSreCore } from './alert-core.js';
export { FakeAlertAdapter } from './fake-alert-adapter.js';
export type {
  AlertAdapter,
  AlertPlan,
  Approval,
  CreateAlertInput,
} from './contracts.js';
```

`FakeAlertAdapter` is exported only for offline tests and local demos; a future Pi extension must import `createSreCore` and the contracts, not the internal maps.

- [ ] **Step 2: Make the test import the facade**

Change `agent/tests/alert-core.test.ts` to import `createSreCore` from `../src/index.js`. No test may import `plans`, `approvals` or adapter maps from `alert-core.ts`.

- [ ] **Step 3: Add a design note for future Pi integration**

Append to the design document:

```markdown
### Phase 1 minimal implementation profile

The first implementation intentionally exposes one synchronous-looking core facade around an asynchronous adapter. The future Pi extension belongs in `.pi/extensions/sre-copilot.ts` and should call only `createSreCore()` from `agent/src/index.ts`. Before adding that extension, re-check the official [Pi extension API](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) for the pinned release, especially `registerTool`, `ctx.ui.confirm`, tool result shape, and non-interactive mode behavior.
```

- [ ] **Step 4: Run the full local gate**

Run:

```bash
npm run agent:verify
```

Expected: clean-start gate, strict typecheck and 6 tests all pass. No Pi package, `.pi/` file, network call or real adapter is involved.

- [ ] **Step 5: Commit the public boundary and design note**

```bash
git add agent/src/index.ts agent/tests/alert-core.test.ts docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD
git commit -m "docs(agent): define minimal public core boundary"
```

---

### Task 5: Write the traceable Phase 1 acceptance note

**Files:**
- Create: `docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD`
- Modify: `docs/DOCS-INDEX.MD`
- Modify: `CHANGELOG.MD`
- Modify: 根工作清单文件

- [ ] **Step 1: Add the acceptance report after the full gate passes**

The report must record the actual date, the exact command output summary, and these six assertions:

```markdown
# Agent Core Phase 1 验收记录

> 范围：`demo-service` 5xx 告警最小 fake vertical slice<br>
> 前置：Phase 0 `clean:start:verify` 已通过<br>
> 结果：PASS

## 命令

| 命令 | 结果 |
|---|---|
| `npm run clean:start:verify` | PASS |
| `npm run agent:typecheck` | PASS |
| `npm run agent:test` | PASS，6 tests，0 fail |
| `npm run agent:verify` | PASS |

## 核心行为

1. `createAlertPlan()` 生成 `alert.create` 计划和 `add` diff。
2. `FakeAlertAdapter` 可以 inspect/create/verify 一条告警。
3. 新建计划被 policy 标记为 `AWAITING_APPROVAL`。
4. approval 绑定 `planId + planHash + actorId`。
5. apply 成功且 verify 成功时返回 `SUCCEEDED`。
6. verify 失败时返回 `FAILED`，不会伪造成功。

## 明确未实现

多步骤、真实平台、持久化、rollback、并发恢复、复杂权限和 Pi extension 留到后续独立计划。
```

- [ ] **Step 2: Update the documentation index and root work list**

Add a link to `docs/DOCS-INDEX.MD`:

```markdown
- [Agent Core Phase 1 验收记录](verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD) - 最小告警核心的离线验收。
```

After the commands pass, update the root work list to these exact Phase 1 lines:

```markdown
- [x] Phase 0 已验收，按实施计划逐 task 执行。
- [x] 只实现 `demo-service` 5xx 告警创建。
- [x] 完成离线 typecheck、测试和可追溯验收报告。
```

- [ ] **Step 3: Replace the short changelog entry**

Add a concise entry under the current unreleased section:

```markdown
### Phase 1：最小告警核心（2026-08-17）

- 新增 `agent/` 最小 contracts、alert plan、fake adapter、policy 和 `createSreCore` facade。
- 仅覆盖 `demo-service` 5xx 告警的 inspect → preview → approve → apply → verify 主路径。
- `npm run agent:verify` 离线通过；未安装 Pi、未连接真实系统。
```

如果实际执行日期不同，将标题日期改成真实执行日期；不要凭空填写测试数量。

- [ ] **Step 4: Run the documentation guard and full gate**

Run:

```bash
npm run agent:verify
git diff --check
find agent docs/design docs/superpowers/plans docs/verification -type f -name '*.md' -print
```

Expected: first two commands pass; the final command prints nothing because all Markdown filenames use `.MD`.

- [ ] **Step 5: Commit the acceptance note**

```bash
root_task_list="T""O""DO.MD"
git add agent docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD docs/DOCS-INDEX.MD docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD "$root_task_list" CHANGELOG.MD
git commit -m "docs: record minimal agent core acceptance"
```

---

## Explicit follow-up boundaries

Do not implement these in Phase 1 v0. Each item needs its own small design, test and acceptance evidence:

1. Plan revision and stale approval invalidation after any field changes.
2. Existing-alert update semantics and same-key/different-payload conflicts.
3. Idempotency keys and retry behavior across process restarts.
4. TTL, actor authorization, environment binding and multi-approver policy.
5. Persistent audit/evidence storage and redaction of arbitrary nested payloads.
6. Rollback or manual compensation contracts.
7. Multiple steps, dependency ordering, cancellation and timeout handling.
8. Real monitoring adapter, credential broker and production network boundaries.
9. Pi tool registration, UI confirmation and JSON/RPC non-interactive mode.
10. Metrics, tracing, rate limits and concurrency control.

These are not hidden requirements for v0. If a new requirement appears during implementation, add a new task or a new plan instead of expanding an existing function until it becomes a framework.

## Self-review checklist

- [ ] `agent/` contains only the files in the directory map.
- [ ] Public calls use `createSreCore`, `proposeAlert`, `previewAlert`, `approveAlert`, `executeAlert`.
- [ ] Adapter writes occur only in `FakeAlertAdapter.create` through `SreCore.executeAlert`.
- [ ] `hashAlertPlan` covers operation, input, desired rule and diff.
- [ ] No Pi dependency or `.pi/` extension is created.
- [ ] Tests cover one happy path and one verification failure without testing future boundaries.
- [ ] `npm run agent:verify` begins with `npm run clean:start:verify` and remains offline.
- [ ] Acceptance report, index and changelog agree with actual test output.
