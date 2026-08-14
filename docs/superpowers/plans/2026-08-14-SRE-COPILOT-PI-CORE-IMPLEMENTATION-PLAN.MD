# SRE Copilot Pi Core Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution rule:** 本计划评审通过后，由人与 AI 半手动、小步骤、逐次验收执行；不要自动委派 subagent。每个 task 完成测试并由用户确认后，再进入下一个 task。

**Goal:** 在独立 `agent/` 包内离线实现“为 `demo-service` 创建 5xx 错误率告警”的完整受控写操作路径，并证明 policy、确认、幂等、复验、审计和脱敏不变量。

**Architecture:** Core contracts、确定性 policy、ActionPlan 状态机、fake alert adapter 和 audit/evidence 通过 ports 解耦；`ActionRuntime` 是唯一可以调用 adapter 写方法的组件。Pi 只预留为 `agent/src/index.ts` 公开 facade 的未来调用方，本阶段不安装 Pi 依赖、不创建 extension、不连接真实系统，也不修改 `v2/`。

**Tech Stack:** TypeScript 5.9、Node.js 20+、`node:test`、`tsx`、Node `crypto`、Markdown；不新增第三方运行时或测试依赖。

---

## Scope guard

本计划只覆盖一个 vertical slice：

```text
create demo-service 5xx alert
  -> inspect fake current state
  -> build ActionPlan
  -> deterministic policy
  -> preview redacted diff
  -> hash-bound approval
  -> idempotent fake apply
  -> verify
  -> audit + safe user events
```

下列内容不在任务清单中：真实 BK Monitor、dev-observe、dev-ssh、Kubernetes、Git、CI/CD、企微、生产发布、多租户、持久队列、分布式锁、真实 RBAC、跨进程恢复和 Pi SDK 接线。

## File map

### Create

- `agent/package.json` — `agent` 包元数据和离线 `typecheck/test/verify` 脚本；只引用根目录已安装工具。
- `agent/tsconfig.json` — 严格 TypeScript 配置。
- `agent/src/contracts/common.ts` — JSON、actor、environment、目标等基础合同。
- `agent/src/contracts/action-plan.ts` — 操作模型、计划/步骤状态与 `ActionPlan`。
- `agent/src/contracts/results.ts` — diff、确认、策略、执行、复验与回滚结果。
- `agent/src/contracts/evidence.ts` — evidence 与 artifact 引用。
- `agent/src/contracts/events.ts` — 审计事件与用户可见事件。
- `agent/src/contracts/adapter.ts` — capability 与 adapter port。
- `agent/src/contracts/index.ts` — 合同层统一导出。
- `agent/src/runtime/errors.ts` — 安全错误构造与归一化。
- `agent/src/runtime/plan-hash.ts` — 稳定序列化和计划 SHA-256。
- `agent/src/runtime/approval-gate.ts` — 确认创建、撤销和执行前校验。
- `agent/src/runtime/state-machine.ts` — 唯一合法状态转换表。
- `agent/src/runtime/in-memory-stores.ts` — plan、approval、observation、result 和 audit 内存存储。
- `agent/src/policy/policy-engine.ts` — 确定性风险与执行模式计算。
- `agent/src/adapters/fake-alert-adapter.ts` — fake 告警资源与幂等执行器。
- `agent/src/evidence/redact.ts` — 敏感键和值递归脱敏。
- `agent/src/audit/render-user-events.ts` — 用户可见事件白名单投影。
- `agent/src/capabilities/alerts/build-create-alert-plan.ts` — 单一 demo 告警计划构建器。
- `agent/src/runtime/action-runtime.ts` — 生命周期编排、门禁和复验。
- `agent/src/index.ts` — 未来 Pi/Web 等 harness 的唯一公开入口。
- `agent/tests/support/fixtures.ts` — 固定 actor、environment、时钟和 plan fixture。
- `agent/tests/contracts.test.ts` — 合同与枚举约束。
- `agent/tests/plan-hash.test.ts` — plan hash 与确认失效。
- `agent/tests/state-machine.test.ts` — 主路径和异常状态机。
- `agent/tests/policy-engine.test.ts` — policy 矩阵。
- `agent/tests/fake-alert-adapter.test.ts` — diff、幂等和复验。
- `agent/tests/user-visible-events.test.ts` — 脱敏与内部思维隔离。
- `agent/tests/action-runtime.test.ts` — 完整 vertical slice 与拒绝/失败路径。
- `agent/tests/documentation-guard.test.ts` — 验收报告、索引与变更记录入口守门。
- `docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD` — 实施完成后的可追溯验收记录。

### Modify

- `package.json` — 新增 `agent:typecheck`、`agent:test`、`agent:verify`，不改变任何 `v2:*` 脚本。
- `docs/DOCS-INDEX.MD` — 加入第一阶段验收报告入口。
- `CHANGELOG.MD` — 记录第一阶段实现和离线验证结果。

### Explicitly untouched

- `v2/**`
- `.pi/**`
- `package-lock.json`
- 真实环境配置、凭证与部署资产

---

### Task 1: 建立独立 package、核心合同和离线测试入口

**Files:**
- Create: `agent/package.json`
- Create: `agent/tsconfig.json`
- Create: `agent/src/contracts/common.ts`
- Create: `agent/src/contracts/action-plan.ts`
- Create: `agent/src/contracts/results.ts`
- Create: `agent/src/contracts/evidence.ts`
- Create: `agent/src/contracts/events.ts`
- Create: `agent/src/contracts/adapter.ts`
- Create: `agent/src/contracts/index.ts`
- Create: `agent/tests/contracts.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试，锁定领域枚举和必需字段**

`agent/tests/contracts.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTION_PLAN_STATUSES,
  EXECUTION_MODES,
  OPERATION_KINDS,
  RISK_LEVELS,
  type ActionStep,
} from '../src/contracts/index.js';

test('core contracts expose the complete operation and governance model', () => {
  assert.deepEqual(OPERATION_KINDS, [
    'observe', 'analyze_code', 'design', 'change', 'release', 'verify', 'rollback',
  ]);
  assert.deepEqual(EXECUTION_MODES, ['auto', 'confirm', 'advice_only', 'deny']);
  assert.deepEqual(RISK_LEVELS, ['read', 'low', 'medium', 'high', 'critical']);
  assert.deepEqual(ACTION_PLAN_STATUSES, [
    'DRAFT', 'PREFLIGHTED', 'PREVIEWED', 'AWAITING_APPROVAL', 'APPROVED',
    'EXECUTING', 'VERIFYING', 'SUCCEEDED', 'BLOCKED', 'FAILED',
    'ROLLBACK_REQUIRED', 'ROLLING_BACK', 'ROLLED_BACK',
  ]);
});

test('ActionStep keeps every write-safety field explicit', () => {
  const step: ActionStep = {
    id: 'step-create-alert',
    kind: 'change',
    capability: 'monitor.alert.create',
    capabilityVersion: '1.0',
    target: {
      type: 'alert_policy',
      resourceId: 'alert-policy/demo-service-5xx-error-rate',
      environment: { name: 'demo', tier: 'development' },
      scope: { service: 'demo-service' },
    },
    params: { alert: { name: 'demo-service 5xx error rate' } },
    mutates: true,
    mutationType: 'create',
    riskLevel: null,
    executionMode: null,
    preconditions: [],
    expectedEffects: [],
    verification: [],
    rollback: {
      mode: 'compensation',
      supported: false,
      instructions: ['Disable or remove the fake alert through an approved recovery plan.'],
      verification: [],
    },
    idempotencyKey: 'alert:create:demo:demo-service:5xx:v1',
    dependencies: [],
    status: 'PENDING',
  };

  assert.equal(step.mutates, true);
  assert.equal(step.idempotencyKey, 'alert:create:demo:demo-service:5xx:v1');
  assert.equal(step.rollback.supported, false);
});
```

- [ ] **Step 2: 运行测试，确认合同模块尚不存在**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/contracts.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/contracts/index.js'`。

- [ ] **Step 3: 创建 package 与 TypeScript 配置**

`agent/package.json`

```json
{
  "name": "@sre-copilot/agent-core",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "typecheck": "../node_modules/.bin/tsc -p tsconfig.json --noEmit",
    "test": "../node_modules/.bin/tsx --test tests/*.test.ts",
    "verify": "npm run typecheck && npm test"
  }
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
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

在根 `package.json` 的 `scripts` 对象中加入以下三个键，保留所有原脚本原样：

```json
"agent:typecheck": "npm --prefix agent run typecheck",
"agent:test": "npm --prefix agent test",
"agent:verify": "npm --prefix agent run verify"
```

此任务不添加依赖，不修改 `package-lock.json`。

- [ ] **Step 4: 写完整基础、计划和结果合同**

`agent/src/contracts/common.ts`

```ts
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue }

export interface ActorRef {
  id: string;
  type: 'user' | 'service' | 'scheduler';
  displayName: string;
}

export interface EnvironmentRef {
  name: string;
  tier: 'local' | 'development' | 'staging' | 'production';
}

export interface TimeWindow {
  start: string;
  end: string;
  timezone: string;
}

export interface ActionTarget {
  type: 'service' | 'alert_policy' | 'dashboard' | 'metric' | 'trace' | 'release';
  resourceId?: string;
  environment: EnvironmentRef;
  scope: Readonly<Record<string, string>>;
}
```

`agent/src/contracts/action-plan.ts`

```ts
import type { ActionTarget, ActorRef, EnvironmentRef, JsonObject } from './common.js';
import type { ArtifactRef, EvidenceItem } from './evidence.js';
import type { PlanDiff, PolicyDecision, RollbackPlan } from './results.js';

export const OPERATION_KINDS = [
  'observe', 'analyze_code', 'design', 'change', 'release', 'verify', 'rollback',
] as const;
export type OperationKind = typeof OPERATION_KINDS[number];

export const EXECUTION_MODES = ['auto', 'confirm', 'advice_only', 'deny'] as const;
export type ExecutionMode = typeof EXECUTION_MODES[number];

export const RISK_LEVELS = ['read', 'low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

export type MutationType = 'none' | 'create' | 'update' | 'delete' | 'release' | 'execute_remote';

export const ACTION_PLAN_STATUSES = [
  'DRAFT', 'PREFLIGHTED', 'PREVIEWED', 'AWAITING_APPROVAL', 'APPROVED',
  'EXECUTING', 'VERIFYING', 'SUCCEEDED', 'BLOCKED', 'FAILED',
  'ROLLBACK_REQUIRED', 'ROLLING_BACK', 'ROLLED_BACK',
] as const;
export type ActionPlanStatus = typeof ACTION_PLAN_STATUSES[number];

export type ActionStepStatus =
  | 'PENDING' | 'READY' | 'RUNNING' | 'APPLIED' | 'VERIFYING' | 'SUCCEEDED'
  | 'BLOCKED' | 'FAILED' | 'ROLLBACK_REQUIRED' | 'ROLLING_BACK'
  | 'ROLLED_BACK' | 'SKIPPED';

export interface StepPrecondition {
  id: string;
  description: string;
  check: 'resource_absent' | 'resource_matches' | 'evidence_fresh' | 'policy_allows';
  params: JsonObject;
}

export interface ExpectedEffect {
  description: string;
  resourceType: string;
  resourceId: string;
  desiredState: JsonObject;
}

export interface VerificationSpec {
  id: string;
  description: string;
  capability: string;
  assertion: 'resource_exists' | 'resource_matches' | 'signal_within_range';
  params: JsonObject;
}

export interface ActionStep {
  id: string;
  kind: OperationKind;
  capability: string;
  capabilityVersion: string;
  target: ActionTarget;
  params: JsonObject;
  mutates: boolean;
  mutationType: MutationType;
  riskLevel: RiskLevel | null;
  executionMode: ExecutionMode | null;
  preconditions: readonly StepPrecondition[];
  expectedEffects: readonly ExpectedEffect[];
  verification: readonly VerificationSpec[];
  rollback: RollbackPlan;
  idempotencyKey: string;
  dependencies: readonly string[];
  status: ActionStepStatus;
}

export interface ActionPlan {
  schemaVersion: '1.0';
  id: string;
  revision: number;
  planHash: string;
  policyVersion: string;
  actor: ActorRef;
  environment: EnvironmentRef;
  objective: string;
  status: ActionPlanStatus;
  steps: readonly ActionStep[];
  diffs: readonly PlanDiff[];
  policyDecisions: readonly PolicyDecision[];
  evidence: readonly EvidenceItem[];
  artifacts: readonly ArtifactRef[];
  approvalIds: readonly string[];
  auditId: string;
  createdAt: string;
  updatedAt: string;
}
```

`agent/src/contracts/evidence.ts`

```ts
import type { TimeWindow } from './common.js';

export interface ArtifactRef {
  id: string;
  kind: 'diff' | 'observation' | 'execution_receipt' | 'verification_report';
  uri: string;
  mediaType: string;
  sha256: string;
  redacted: boolean;
  createdAt: string;
}

export interface EvidenceItem {
  id: string;
  type: 'current_state' | 'policy' | 'execution' | 'verification';
  source: string;
  summary: string;
  observedAt: string;
  window?: TimeWindow;
  sensitivity: 'public' | 'internal' | 'confidential';
  digest: string;
  artifactRefs: readonly string[];
}
```

`agent/src/contracts/results.ts`

```ts
import type { RiskLevel, ExecutionMode, VerificationSpec } from './action-plan.js';
import type { ActionTarget, ActorRef, EnvironmentRef, JsonObject, JsonValue } from './common.js';
import type { ArtifactRef, EvidenceItem } from './evidence.js';

export interface RollbackPlan {
  mode: 'automatic' | 'manual' | 'compensation' | 'none';
  supported: boolean;
  capability?: string;
  params?: JsonObject;
  instructions: readonly string[];
  verification: readonly VerificationSpec[];
}

export interface PlanDiffChange {
  path: string;
  operation: 'add' | 'replace' | 'remove';
  before: JsonValue | null;
  after: JsonValue | null;
}

export interface PlanDiff {
  id: string;
  stepId: string;
  target: ActionTarget;
  before: JsonObject | null;
  after: JsonObject | null;
  changes: readonly PlanDiffChange[];
  redacted: boolean;
  generatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  planId: string;
  planHash: string;
  actor: ActorRef;
  environment: EnvironmentRef;
  decision: 'approved' | 'rejected';
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  revocationReason?: 'plan_changed' | 'policy_changed' | 'actor_revoked';
}

export interface PolicyFactor {
  name: 'capability' | 'environment' | 'operation' | 'resource_scope' | 'mutation_type';
  value: string;
  risk: RiskLevel;
}

export interface PolicyDecision {
  id: string;
  planId: string;
  stepId: string;
  policyVersion: string;
  allowed: boolean;
  riskLevel: RiskLevel;
  executionMode: ExecutionMode;
  factors: readonly PolicyFactor[];
  reasonCodes: readonly string[];
  evaluatedAt: string;
  expiresAt: string;
}

export interface SafeRuntimeError {
  code:
    | 'INVALID_TRANSITION' | 'POLICY_DENIED' | 'APPROVAL_REQUIRED'
    | 'APPROVAL_INVALID' | 'PRECONDITION_FAILED' | 'IDEMPOTENCY_CONFLICT'
    | 'ADAPTER_ERROR' | 'VERIFICATION_FAILED';
  message: string;
  retryable: boolean;
}

export interface ExecutionResult {
  stepId: string;
  adapterId: string;
  idempotencyKey: string;
  status: 'applied' | 'deduplicated' | 'failed';
  resourceRef?: string;
  evidence: readonly EvidenceItem[];
  artifacts: readonly ArtifactRef[];
  startedAt: string;
  finishedAt: string;
  error?: SafeRuntimeError;
}

export interface VerificationCheckResult {
  verificationId: string;
  passed: boolean;
  expected: JsonValue;
  actual: JsonValue;
  message: string;
}

export interface VerificationResult {
  stepId: string;
  status: 'passed' | 'failed' | 'blocked';
  checks: readonly VerificationCheckResult[];
  evidence: readonly EvidenceItem[];
  artifacts: readonly ArtifactRef[];
  startedAt: string;
  finishedAt: string;
  error?: SafeRuntimeError;
}

```

- [ ] **Step 5: 写 adapter 与事件合同，并统一导出**

`agent/src/contracts/events.ts`

```ts
import type { ActionPlanStatus, RiskLevel } from './action-plan.js';
import type { ActionTarget, ActorRef, EnvironmentRef, TimeWindow } from './common.js';
import type { PlanDiff, VerificationResult } from './results.js';

export type AuditEventType =
  | 'PLAN_CREATED' | 'PLAN_REVISED' | 'STATE_CHANGED' | 'POLICY_EVALUATED'
  | 'DIFF_PREVIEWED' | 'APPROVAL_REQUESTED' | 'APPROVAL_RECORDED'
  | 'APPROVAL_REVOKED' | 'STEP_STARTED' | 'STEP_FINISHED'
  | 'VERIFICATION_FINISHED' | 'BLOCKER_RECORDED';

export interface AuditEvent {
  id: string;
  auditId: string;
  planId: string;
  planHash: string;
  type: AuditEventType;
  fromStatus?: ActionPlanStatus;
  toStatus?: ActionPlanStatus;
  stepId?: string;
  actor: ActorRef;
  environment: EnvironmentRef;
  capability?: string;
  redactedInputSummary?: string;
  outcome: 'info' | 'allowed' | 'denied' | 'success' | 'failure';
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
  artifactRefs: readonly string[];
  durationMs?: number;
  occurredAt: string;
}

export interface UserVisibleStepEvent {
  id: string;
  planId: string;
  auditId: string;
  phase: ActionPlanStatus;
  stepId?: string;
  status: 'pending' | 'running' | 'waiting' | 'success' | 'failure' | 'blocked';
  message: string;
  target?: ActionTarget;
  capability?: string;
  redactedInputSummary?: string;
  queryWindow?: TimeWindow;
  durationMs?: number;
  diff?: PlanDiff;
  riskLevel?: RiskLevel;
  approvalStatus?: 'not_required' | 'waiting' | 'approved' | 'expired' | 'revoked';
  blocker?: { code: string; message: string };
  verification?: VerificationResult;
  evidenceRefs: readonly string[];
  artifactRefs: readonly string[];
  auditEventId: string;
  recommendedNextStep?: string;
  occurredAt: string;
}
```

`agent/src/contracts/adapter.ts`

```ts
import type { ActionStep, ExecutionMode, MutationType, OperationKind, RiskLevel } from './action-plan.js';
import type { EnvironmentRef, ActorRef, JsonObject } from './common.js';
import type { ArtifactRef, EvidenceItem } from './evidence.js';
import type { ExecutionResult, PlanDiff, RollbackPlan, VerificationResult } from './results.js';

export interface CapabilityDefinition {
  id: string;
  version: string;
  adapterId: string;
  operations: readonly OperationKind[];
  mutationTypes: readonly MutationType[];
  targetTypes: readonly ActionStep['target']['type'][];
  allowedEnvironmentTiers: readonly EnvironmentRef['tier'][];
  defaultExecutionMode: ExecutionMode;
  riskByMutation: Readonly<Partial<Record<MutationType, RiskLevel>>>;
  supportsRollback: boolean;
}

export interface ObservationResult {
  stepId: string;
  currentState: JsonObject | null;
  evidence: readonly EvidenceItem[];
  artifacts: readonly ArtifactRef[];
  observedAt: string;
}

export interface AdapterExecutionContext {
  planId: string;
  planHash: string;
  actor: ActorRef;
  environment: EnvironmentRef;
  credentialRef?: string;
  now: string;
}

export interface SreAdapter {
  readonly id: string;
  readonly capabilities: readonly CapabilityDefinition[];
  inspectCurrentState(context: AdapterExecutionContext, step: ActionStep): Promise<ObservationResult>;
  previewDiff(
    context: AdapterExecutionContext,
    step: ActionStep,
    observation: ObservationResult,
  ): Promise<PlanDiff>;
  apply(context: AdapterExecutionContext, step: ActionStep): Promise<ExecutionResult>;
  verify(
    context: AdapterExecutionContext,
    step: ActionStep,
    execution: ExecutionResult,
  ): Promise<VerificationResult>;
  rollback?(
    context: AdapterExecutionContext,
    step: ActionStep,
    rollback: RollbackPlan,
  ): Promise<ExecutionResult>;
}
```

`agent/src/contracts/index.ts`

```ts
export * from './common.js';
export * from './action-plan.js';
export * from './results.js';
export * from './evidence.js';
export * from './events.js';
export * from './adapter.js';
```

- [ ] **Step 6: 运行合同测试和 typecheck**

Run:

```bash
npm run agent:typecheck
npm run agent:test
```

Expected: 两条命令均 PASS；测试摘要包含 `2 tests`、`0 fail`。

- [ ] **Step 7: Commit**

```bash
git add package.json agent/package.json agent/tsconfig.json agent/src/contracts agent/tests/contracts.test.ts
git commit -m "feat(agent): define core action contracts"
```

---

### Task 2: 建立稳定 planHash 和确认门禁

**Files:**
- Create: `agent/src/runtime/plan-hash.ts`
- Create: `agent/src/runtime/approval-gate.ts`
- Create: `agent/tests/support/fixtures.ts`
- Create: `agent/tests/plan-hash.test.ts`

- [ ] **Step 1: 写失败测试，锁定 hash 与确认绑定语义**

`agent/tests/plan-hash.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApproval, validateApproval } from '../src/runtime/approval-gate.js';
import { computePlanHash, withPlanHash } from '../src/runtime/plan-hash.js';
import { ACTOR, ENVIRONMENT, buildPlanFixture } from './support/fixtures.js';

test('runtime status changes do not change the approval hash', () => {
  const draft = withPlanHash(buildPlanFixture());
  const progressed = { ...draft, status: 'PREVIEWED' as const, updatedAt: '2026-08-14T01:01:00.000Z' };
  assert.equal(computePlanHash(progressed), draft.planHash);
});

test('target params and diff changes change the approval hash', () => {
  const plan = withPlanHash(buildPlanFixture());
  const revised = {
    ...plan,
    revision: 2,
    steps: plan.steps.map((step) => ({
      ...step,
      params: { ...step.params, thresholdPercent: 10 },
    })),
  };
  assert.notEqual(computePlanHash(revised), plan.planHash);
});

test('approval requires matching plan hash actor environment and expiry', () => {
  const plan = withPlanHash({ ...buildPlanFixture(), status: 'AWAITING_APPROVAL' });
  const approval = createApproval(plan, {
    id: 'approval-1',
    actor: ACTOR,
    environment: ENVIRONMENT,
    issuedAt: '2026-08-14T01:00:00.000Z',
    expiresAt: '2026-08-14T01:10:00.000Z',
  });

  assert.deepEqual(
    validateApproval(plan, approval, ACTOR, ENVIRONMENT, '2026-08-14T01:05:00.000Z'),
    { valid: true },
  );
  assert.equal(
    validateApproval(plan, approval, ACTOR, ENVIRONMENT, '2026-08-14T01:11:00.000Z').valid,
    false,
  );
  assert.equal(
    validateApproval(
      plan,
      approval,
      { id: 'user-2', type: 'user', displayName: 'Other Operator' },
      ENVIRONMENT,
      '2026-08-14T01:05:00.000Z',
    ).valid,
    false,
  );

  const changed = withPlanHash({
    ...plan,
    revision: 2,
    objective: 'Create a changed alert policy',
  });
  assert.equal(
    validateApproval(changed, approval, ACTOR, ENVIRONMENT, '2026-08-14T01:05:00.000Z').valid,
    false,
  );
});
```

- [ ] **Step 2: 运行测试，确认 runtime 文件缺失**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/plan-hash.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/runtime/approval-gate.js'`。

- [ ] **Step 3: 创建完整 fixture**

`agent/tests/support/fixtures.ts`

```ts
import type { ActionPlan, ActorRef, EnvironmentRef } from '../../src/contracts/index.js';

export const NOW = '2026-08-14T01:00:00.000Z';
export const ACTOR: ActorRef = { id: 'user-1', type: 'user', displayName: 'Demo Operator' };
export const ENVIRONMENT: EnvironmentRef = { name: 'demo', tier: 'development' };

export const DESIRED_ALERT = {
  id: 'alert-policy/demo-service-5xx-error-rate',
  service: 'demo-service',
  name: 'demo-service 5xx error rate',
  expression: 'sum(rate(http_requests_total{service="demo-service",status=~"5.."}[5m])) / clamp_min(sum(rate(http_requests_total{service="demo-service"}[5m])), 1) * 100',
  thresholdPercent: 5,
  evaluationWindowMinutes: 5,
  forMinutes: 10,
  severity: 'warning',
  enabled: true,
} as const;

export function buildPlanFixture(): ActionPlan {
  return {
    schemaVersion: '1.0',
    id: 'plan-demo-alert-1',
    revision: 1,
    planHash: '',
    policyVersion: 'phase1-1.0',
    actor: ACTOR,
    environment: ENVIRONMENT,
    objective: 'Create a 5xx error-rate alert for demo-service',
    status: 'DRAFT',
    steps: [{
      id: 'step-create-alert',
      kind: 'change',
      capability: 'monitor.alert.create',
      capabilityVersion: '1.0',
      target: {
        type: 'alert_policy',
        resourceId: DESIRED_ALERT.id,
        environment: ENVIRONMENT,
        scope: { service: 'demo-service' },
      },
      params: { alert: DESIRED_ALERT },
      mutates: true,
      mutationType: 'create',
      riskLevel: null,
      executionMode: null,
      preconditions: [{
        id: 'alert-absent-or-identical',
        description: 'The alert is absent or already matches the desired configuration.',
        check: 'resource_absent',
        params: { resourceId: DESIRED_ALERT.id },
      }],
      expectedEffects: [{
        description: 'The demo 5xx alert exists with the previewed configuration.',
        resourceType: 'alert_policy',
        resourceId: DESIRED_ALERT.id,
        desiredState: DESIRED_ALERT,
      }],
      verification: [{
        id: 'verify-alert-matches',
        description: 'Read back the alert and compare every desired field.',
        capability: 'monitor.alert.create',
        assertion: 'resource_matches',
        params: { resourceId: DESIRED_ALERT.id, expected: DESIRED_ALERT },
      }],
      rollback: {
        mode: 'compensation',
        supported: false,
        instructions: ['Create a new approved plan to disable or remove the fake alert.'],
        verification: [],
      },
      idempotencyKey: 'alert:create:demo:demo-service:5xx:v1',
      dependencies: [],
      status: 'PENDING',
    }],
    diffs: [],
    policyDecisions: [],
    evidence: [],
    artifacts: [],
    approvalIds: [],
    auditId: 'audit-plan-demo-alert-1',
    createdAt: NOW,
    updatedAt: NOW,
  };
}
```

- [ ] **Step 4: 实现稳定序列化与 approval scope hash**

`agent/src/runtime/plan-hash.ts`

```ts
import { createHash } from 'node:crypto';
import type { ActionPlan, JsonValue } from '../contracts/index.js';

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function stableStringify(value: JsonValue): string {
  return JSON.stringify(canonicalize(value));
}

function approvalScope(plan: ActionPlan): JsonValue {
  return {
    schemaVersion: plan.schemaVersion,
    id: plan.id,
    revision: plan.revision,
    policyVersion: plan.policyVersion,
    actor: plan.actor,
    environment: plan.environment,
    objective: plan.objective,
    steps: plan.steps.map(({ status: _status, ...step }) => step),
    diffs: plan.diffs,
  } as unknown as JsonValue;
}

export function computePlanHash(plan: ActionPlan): string {
  return createHash('sha256').update(stableStringify(approvalScope(plan))).digest('hex');
}

export function withPlanHash(plan: ActionPlan): ActionPlan {
  return { ...plan, planHash: computePlanHash(plan) };
}
```

- [ ] **Step 5: 实现纯函数确认创建与校验**

`agent/src/runtime/approval-gate.ts`

```ts
import type { ActionPlan, ActorRef, ApprovalRecord, EnvironmentRef } from '../contracts/index.js';
import { computePlanHash } from './plan-hash.js';

export interface ApprovalInput {
  id: string;
  actor: ActorRef;
  environment: EnvironmentRef;
  issuedAt: string;
  expiresAt: string;
}

export type ApprovalValidation =
  | { valid: true }
  | { valid: false; reason: 'not_approved' | 'plan_mismatch' | 'actor_mismatch' | 'environment_mismatch' | 'expired' | 'revoked' };

function sameActor(left: ActorRef, right: ActorRef): boolean {
  return left.id === right.id && left.type === right.type;
}

function sameEnvironment(left: EnvironmentRef, right: EnvironmentRef): boolean {
  return left.name === right.name && left.tier === right.tier;
}

export function createApproval(plan: ActionPlan, input: ApprovalInput): ApprovalRecord {
  if (plan.status !== 'AWAITING_APPROVAL') {
    throw new Error(`approval can only be created from AWAITING_APPROVAL, received ${plan.status}`);
  }
  if (!sameActor(plan.actor, input.actor)) throw new Error('approval actor must match the plan actor');
  if (!sameEnvironment(plan.environment, input.environment)) {
    throw new Error('approval environment must match the plan environment');
  }
  if (input.expiresAt <= input.issuedAt) throw new Error('approval expiry must be after issue time');
  return {
    id: input.id,
    planId: plan.id,
    planHash: computePlanHash(plan),
    actor: input.actor,
    environment: input.environment,
    decision: 'approved',
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  };
}

export function validateApproval(
  plan: ActionPlan,
  approval: ApprovalRecord,
  actor: ActorRef,
  environment: EnvironmentRef,
  now: string,
): ApprovalValidation {
  if (approval.decision !== 'approved') return { valid: false, reason: 'not_approved' };
  if (approval.revokedAt) return { valid: false, reason: 'revoked' };
  if (approval.planId !== plan.id || approval.planHash !== computePlanHash(plan)) {
    return { valid: false, reason: 'plan_mismatch' };
  }
  if (!sameActor(approval.actor, actor) || !sameActor(plan.actor, actor)) {
    return { valid: false, reason: 'actor_mismatch' };
  }
  if (!sameEnvironment(approval.environment, environment) || !sameEnvironment(plan.environment, environment)) {
    return { valid: false, reason: 'environment_mismatch' };
  }
  if (now < approval.issuedAt || now >= approval.expiresAt) return { valid: false, reason: 'expired' };
  return { valid: true };
}

export function revokeApproval(
  approval: ApprovalRecord,
  revokedAt: string,
  reason: NonNullable<ApprovalRecord['revocationReason']>,
): ApprovalRecord {
  return { ...approval, revokedAt, revocationReason: reason };
}
```

- [ ] **Step 6: 运行 hash/approval 测试和 typecheck**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/plan-hash.test.ts
npm run agent:typecheck
```

Expected: PASS；测试摘要包含 `3 tests`、`0 fail`。

- [ ] **Step 7: Commit**

```bash
git add agent/src/runtime/plan-hash.ts agent/src/runtime/approval-gate.ts agent/tests/support/fixtures.ts agent/tests/plan-hash.test.ts
git commit -m "feat(agent): bind approvals to plan hashes"
```

---

### Task 3: 建立状态机、安全错误与内存存储

**Files:**
- Create: `agent/src/runtime/errors.ts`
- Create: `agent/src/runtime/state-machine.ts`
- Create: `agent/src/runtime/in-memory-stores.ts`
- Create: `agent/tests/state-machine.test.ts`

- [ ] **Step 1: 写失败测试，锁定主路径、异常路径和非法迁移**

`agent/tests/state-machine.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActionPlan, ActionPlanStatus } from '../src/contracts/index.js';
import { InMemoryRuntimeStores } from '../src/runtime/in-memory-stores.js';
import { canRevisePlan, transitionPlan } from '../src/runtime/state-machine.js';
import { buildPlanFixture } from './support/fixtures.js';

test('state machine accepts the complete successful path', () => {
  const path: ActionPlanStatus[] = [
    'PREFLIGHTED', 'PREVIEWED', 'AWAITING_APPROVAL', 'APPROVED',
    'EXECUTING', 'VERIFYING', 'SUCCEEDED',
  ];
  const final = path.reduce(
    (plan, status) => transitionPlan(plan, status, '2026-08-14T01:00:00.000Z'),
    buildPlanFixture(),
  );
  assert.equal(final.status, 'SUCCEEDED');
});

test('verification side effects use the rollback-required path', () => {
  let plan: ActionPlan = { ...buildPlanFixture(), status: 'EXECUTING' };
  plan = transitionPlan(plan, 'VERIFYING', '2026-08-14T01:00:00.000Z');
  plan = transitionPlan(plan, 'ROLLBACK_REQUIRED', '2026-08-14T01:00:00.000Z');
  plan = transitionPlan(plan, 'ROLLING_BACK', '2026-08-14T01:00:00.000Z');
  plan = transitionPlan(plan, 'ROLLED_BACK', '2026-08-14T01:00:00.000Z');
  assert.equal(plan.status, 'ROLLED_BACK');
});

test('state machine rejects approval and success shortcuts', () => {
  assert.throws(
    () => transitionPlan(buildPlanFixture(), 'APPROVED', '2026-08-14T01:00:00.000Z'),
    /INVALID_TRANSITION/,
  );
  assert.throws(
    () => transitionPlan(buildPlanFixture(), 'SUCCEEDED', '2026-08-14T01:00:00.000Z'),
    /INVALID_TRANSITION/,
  );
});

test('store returns clones and pre-execution plans remain revisable', () => {
  const stores = new InMemoryRuntimeStores();
  const source = buildPlanFixture();
  stores.savePlan(source);
  const read = stores.getPlan(source.id);
  assert.ok(read);
  read.steps[0]!.status = 'FAILED';
  assert.equal(stores.getPlan(source.id)?.steps[0]?.status, 'PENDING');
  assert.equal(canRevisePlan('APPROVED'), true);
  assert.equal(canRevisePlan('EXECUTING'), false);
});
```

- [ ] **Step 2: 运行测试，确认状态机尚不存在**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/state-machine.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/runtime/in-memory-stores.js'`。

- [ ] **Step 3: 实现安全错误和状态转换表**

`agent/src/runtime/errors.ts`

```ts
import type { SafeRuntimeError } from '../contracts/index.js';

export class ActionRuntimeError extends Error {
  constructor(readonly detail: SafeRuntimeError) {
    super(`${detail.code}: ${detail.message}`);
    this.name = 'ActionRuntimeError';
  }
}

export function runtimeError(
  code: SafeRuntimeError['code'],
  message: string,
  retryable = false,
): ActionRuntimeError {
  return new ActionRuntimeError({ code, message, retryable });
}
```

`agent/src/runtime/state-machine.ts`

```ts
import type { ActionPlan, ActionPlanStatus } from '../contracts/index.js';
import { runtimeError } from './errors.js';

const TRANSITIONS: Readonly<Record<ActionPlanStatus, readonly ActionPlanStatus[]>> = {
  DRAFT: ['PREFLIGHTED', 'BLOCKED', 'FAILED'],
  PREFLIGHTED: ['PREVIEWED', 'BLOCKED', 'FAILED'],
  PREVIEWED: ['AWAITING_APPROVAL', 'BLOCKED', 'FAILED'],
  AWAITING_APPROVAL: ['APPROVED', 'BLOCKED', 'FAILED'],
  APPROVED: ['EXECUTING', 'AWAITING_APPROVAL', 'BLOCKED', 'FAILED'],
  EXECUTING: ['VERIFYING', 'FAILED', 'ROLLBACK_REQUIRED'],
  VERIFYING: ['SUCCEEDED', 'FAILED', 'ROLLBACK_REQUIRED'],
  SUCCEEDED: [],
  BLOCKED: [],
  FAILED: [],
  ROLLBACK_REQUIRED: ['ROLLING_BACK'],
  ROLLING_BACK: ['ROLLED_BACK', 'FAILED'],
  ROLLED_BACK: [],
};

const REVISABLE = new Set<ActionPlanStatus>([
  'DRAFT', 'PREFLIGHTED', 'PREVIEWED', 'AWAITING_APPROVAL', 'APPROVED', 'BLOCKED', 'FAILED',
]);

export function canRevisePlan(status: ActionPlanStatus): boolean {
  return REVISABLE.has(status);
}

export function transitionPlan(plan: ActionPlan, next: ActionPlanStatus, now: string): ActionPlan {
  if (!TRANSITIONS[plan.status].includes(next)) {
    throw runtimeError('INVALID_TRANSITION', `${plan.status} cannot transition to ${next}`);
  }
  return { ...plan, status: next, updatedAt: now };
}
```

- [ ] **Step 4: 实现深拷贝内存存储**

`agent/src/runtime/in-memory-stores.ts`

```ts
import type {
  ActionPlan, ApprovalRecord, AuditEvent, ExecutionResult,
  ObservationResult, VerificationResult,
} from '../contracts/index.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryRuntimeStores {
  private readonly plans = new Map<string, ActionPlan>();
  private readonly approvals = new Map<string, ApprovalRecord>();
  private readonly observations = new Map<string, ObservationResult>();
  private readonly executions = new Map<string, ExecutionResult>();
  private readonly verifications = new Map<string, VerificationResult>();
  private readonly audits = new Map<string, AuditEvent[]>();

  savePlan(plan: ActionPlan): void { this.plans.set(plan.id, clone(plan)); }
  getPlan(planId: string): ActionPlan | undefined {
    const value = this.plans.get(planId);
    return value ? clone(value) : undefined;
  }

  saveApproval(value: ApprovalRecord): void { this.approvals.set(value.id, clone(value)); }
  listApprovals(planId: string): ApprovalRecord[] {
    return [...this.approvals.values()].filter((item) => item.planId === planId).map(clone);
  }
  replaceApproval(value: ApprovalRecord): void { this.approvals.set(value.id, clone(value)); }

  saveObservation(planId: string, value: ObservationResult): void {
    this.observations.set(`${planId}:${value.stepId}`, clone(value));
  }
  getObservation(planId: string, stepId: string): ObservationResult | undefined {
    const value = this.observations.get(`${planId}:${stepId}`);
    return value ? clone(value) : undefined;
  }

  saveExecution(planId: string, value: ExecutionResult): void {
    this.executions.set(`${planId}:${value.stepId}`, clone(value));
  }
  getExecution(planId: string, stepId: string): ExecutionResult | undefined {
    const value = this.executions.get(`${planId}:${stepId}`);
    return value ? clone(value) : undefined;
  }

  saveVerification(planId: string, value: VerificationResult): void {
    this.verifications.set(`${planId}:${value.stepId}`, clone(value));
  }
  listVerifications(planId: string): VerificationResult[] {
    return [...this.verifications.entries()]
      .filter(([key]) => key.startsWith(`${planId}:`))
      .map(([, value]) => clone(value));
  }

  appendAudit(value: AuditEvent): void {
    const events = this.audits.get(value.planId) ?? [];
    this.audits.set(value.planId, [...events, clone(value)]);
  }
  listAudits(planId: string): AuditEvent[] {
    return (this.audits.get(planId) ?? []).map(clone);
  }
}
```

- [ ] **Step 5: 运行状态机测试和全量 typecheck**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/state-machine.test.ts
npm run agent:typecheck
```

Expected: PASS；测试摘要包含 `4 tests`、`0 fail`。

- [ ] **Step 6: Commit**

```bash
git add agent/src/runtime/errors.ts agent/src/runtime/state-machine.ts agent/src/runtime/in-memory-stores.ts agent/tests/state-machine.test.ts
git commit -m "feat(agent): add action plan state machine"
```

---
### Task 4: 实现确定性 PolicyEngine

**Files:**
- Create: `agent/src/policy/policy-engine.ts`
- Create: `agent/tests/policy-engine.test.ts`

- [ ] **Step 1: 写失败测试，锁定 demo 写入、只读 auto 和越界 deny**

`agent/tests/policy-engine.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapabilityDefinition } from '../src/contracts/index.js';
import { FAKE_ALERT_CAPABILITY, PolicyEngine } from '../src/policy/policy-engine.js';
import { buildPlanFixture } from './support/fixtures.js';

const engine = new PolicyEngine([FAKE_ALERT_CAPABILITY], {
  now: () => '2026-08-14T01:00:00.000Z',
  nextId: () => 'policy-1',
});

test('demo-service alert creation is medium risk and confirm-only', () => {
  const plan = buildPlanFixture();
  const step = { ...plan.steps[0]!, riskLevel: 'read' as const, executionMode: 'auto' as const };
  const decision = engine.evaluate(plan, step);
  assert.equal(decision.allowed, true);
  assert.equal(decision.riskLevel, 'medium');
  assert.equal(decision.executionMode, 'confirm');
});

test('production and non-demo-service writes are denied deterministically', () => {
  const plan = buildPlanFixture();
  const productionStep = {
    ...plan.steps[0]!,
    target: {
      ...plan.steps[0]!.target,
      environment: { name: 'prod', tier: 'production' as const },
    },
  };
  const production = engine.evaluate({ ...plan, environment: productionStep.target.environment }, productionStep);
  assert.equal(production.allowed, false);
  assert.equal(production.riskLevel, 'critical');
  assert.equal(production.executionMode, 'deny');

  const otherService = {
    ...plan.steps[0]!,
    target: { ...plan.steps[0]!.target, scope: { service: 'payments' } },
  };
  assert.equal(engine.evaluate(plan, otherService).executionMode, 'deny');
});

test('registered non-mutating observe capability can run auto at read risk', () => {
  const observeCapability: CapabilityDefinition = {
    id: 'monitor.metric.read',
    version: '1.0',
    adapterId: 'fake-observe',
    operations: ['observe'],
    mutationTypes: ['none'],
    targetTypes: ['service'],
    allowedEnvironmentTiers: ['development'],
    defaultExecutionMode: 'auto',
    riskByMutation: { none: 'read' },
    supportsRollback: false,
  };
  const observeEngine = new PolicyEngine([observeCapability], {
    now: () => '2026-08-14T01:00:00.000Z',
    nextId: () => 'policy-observe',
  });
  const plan = buildPlanFixture();
  const step = {
    ...plan.steps[0]!,
    kind: 'observe' as const,
    capability: observeCapability.id,
    target: { ...plan.steps[0]!.target, type: 'service' as const },
    mutates: false,
    mutationType: 'none' as const,
  };
  const decision = observeEngine.evaluate(plan, step);
  assert.equal(decision.allowed, true);
  assert.equal(decision.riskLevel, 'read');
  assert.equal(decision.executionMode, 'auto');
});
```

- [ ] **Step 2: 运行测试，确认 policy 模块缺失**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/policy-engine.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/policy/policy-engine.js'`。

- [ ] **Step 3: 实现 capability registry 与确定性风险算法**

`agent/src/policy/policy-engine.ts`

```ts
import type {
  ActionPlan, ActionStep, CapabilityDefinition, ExecutionMode,
  PolicyDecision, PolicyFactor, RiskLevel,
} from '../contracts/index.js';

export const POLICY_VERSION = 'phase1-1.0';

export const FAKE_ALERT_CAPABILITY: CapabilityDefinition = {
  id: 'monitor.alert.create',
  version: '1.0',
  adapterId: 'fake-alert',
  operations: ['change'],
  mutationTypes: ['create'],
  targetTypes: ['alert_policy'],
  allowedEnvironmentTiers: ['development'],
  defaultExecutionMode: 'confirm',
  riskByMutation: { create: 'medium' },
  supportsRollback: false,
};

const RISK_RANK: Readonly<Record<RiskLevel, number>> = {
  read: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function maxRisk(factors: readonly PolicyFactor[]): RiskLevel {
  return factors.reduce<RiskLevel>(
    (current, factor) => RISK_RANK[factor.risk] > RISK_RANK[current] ? factor.risk : current,
    'read',
  );
}

function operationRisk(step: ActionStep): RiskLevel {
  const risks: Readonly<Record<ActionStep['kind'], RiskLevel>> = {
    observe: 'read',
    analyze_code: 'read',
    design: 'low',
    change: 'medium',
    release: 'high',
    verify: 'read',
    rollback: 'high',
  };
  return risks[step.kind];
}

function environmentRisk(step: ActionStep): RiskLevel {
  const risks: Readonly<Record<ActionStep['target']['environment']['tier'], RiskLevel>> = {
    local: 'low',
    development: step.mutates ? 'medium' : 'read',
    staging: 'high',
    production: 'critical',
  };
  return risks[step.target.environment.tier];
}

export interface PolicyEngineOptions {
  now: () => string;
  nextId: () => string;
}

export class PolicyEngine {
  private readonly capabilities: Map<string, CapabilityDefinition>;

  constructor(capabilities: readonly CapabilityDefinition[], private readonly options: PolicyEngineOptions) {
    this.capabilities = new Map(capabilities.map((capability) => [capability.id, capability]));
  }

  getCapability(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id);
  }

  evaluate(plan: ActionPlan, step: ActionStep): PolicyDecision {
    const capability = this.capabilities.get(step.capability);
    const factors: PolicyFactor[] = [
      { name: 'capability', value: step.capability, risk: capability?.riskByMutation[step.mutationType] ?? 'critical' },
      { name: 'environment', value: `${step.target.environment.name}/${step.target.environment.tier}`, risk: environmentRisk(step) },
      { name: 'operation', value: step.kind, risk: operationRisk(step) },
      {
        name: 'resource_scope',
        value: JSON.stringify(step.target.scope),
        risk: step.target.scope.service === 'demo-service' ? (step.mutates ? 'low' : 'read') : 'critical',
      },
      { name: 'mutation_type', value: step.mutationType, risk: capability?.riskByMutation[step.mutationType] ?? 'critical' },
    ];

    const reasonCodes: string[] = [];
    if (!capability) reasonCodes.push('CAPABILITY_NOT_REGISTERED');
    if (capability && capability.version !== step.capabilityVersion) reasonCodes.push('CAPABILITY_VERSION_MISMATCH');
    if (capability && !capability.operations.includes(step.kind)) reasonCodes.push('OPERATION_NOT_ALLOWED');
    if (capability && !capability.mutationTypes.includes(step.mutationType)) reasonCodes.push('MUTATION_NOT_ALLOWED');
    if (capability && !capability.targetTypes.includes(step.target.type)) reasonCodes.push('TARGET_TYPE_NOT_ALLOWED');
    if (capability && !capability.allowedEnvironmentTiers.includes(step.target.environment.tier)) {
      reasonCodes.push('ENVIRONMENT_NOT_ALLOWED');
    }
    if (plan.environment.name !== step.target.environment.name || plan.environment.tier !== step.target.environment.tier) {
      reasonCodes.push('PLAN_TARGET_ENVIRONMENT_MISMATCH');
    }
    if (step.target.environment.name !== 'demo') reasonCodes.push('PHASE1_ENVIRONMENT_OUT_OF_SCOPE');
    if (step.target.scope.service !== 'demo-service') reasonCodes.push('PHASE1_RESOURCE_OUT_OF_SCOPE');

    const allowed = reasonCodes.length === 0;
    const riskLevel = maxRisk(factors);
    let executionMode: ExecutionMode;
    if (!allowed) executionMode = 'deny';
    else if (step.mutates || RISK_RANK[riskLevel] >= RISK_RANK.medium) executionMode = 'confirm';
    else executionMode = capability?.defaultExecutionMode ?? 'advice_only';

    const evaluatedAt = this.options.now();
    const expiresAt = new Date(Date.parse(evaluatedAt) + 5 * 60_000).toISOString();
    return {
      id: this.options.nextId(),
      planId: plan.id,
      stepId: step.id,
      policyVersion: POLICY_VERSION,
      allowed,
      riskLevel,
      executionMode,
      factors,
      reasonCodes: allowed ? ['PHASE1_DEMO_ALERT_ALLOWED'] : reasonCodes,
      evaluatedAt,
      expiresAt,
    };
  }
}
```

- [ ] **Step 4: 运行 policy 测试与 typecheck**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/policy-engine.test.ts
npm run agent:typecheck
```

Expected: PASS；测试摘要包含 `3 tests`、`0 fail`。

- [ ] **Step 5: Commit**

```bash
git add agent/src/policy/policy-engine.ts agent/tests/policy-engine.test.ts
git commit -m "feat(agent): enforce deterministic action policy"
```

---

### Task 5: 实现 fake alert adapter、diff、幂等和复验

**Files:**
- Create: `agent/src/adapters/fake-alert-adapter.ts`
- Create: `agent/tests/fake-alert-adapter.test.ts`

- [ ] **Step 1: 写失败测试，锁定 current state、幂等冲突和复验**

`agent/tests/fake-alert-adapter.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeAlertAdapter } from '../src/adapters/fake-alert-adapter.js';
import type { AdapterExecutionContext } from '../src/contracts/index.js';
import { withPlanHash } from '../src/runtime/plan-hash.js';
import { ACTOR, ENVIRONMENT, buildPlanFixture } from './support/fixtures.js';

function context(): AdapterExecutionContext {
  const plan = withPlanHash(buildPlanFixture());
  return {
    planId: plan.id,
    planHash: plan.planHash,
    actor: ACTOR,
    environment: ENVIRONMENT,
    now: '2026-08-14T01:00:00.000Z',
  };
}

test('adapter previews an add diff from empty current state', async () => {
  const adapter = new FakeAlertAdapter();
  const step = buildPlanFixture().steps[0]!;
  const observation = await adapter.inspectCurrentState(context(), step);
  const diff = await adapter.previewDiff(context(), step, observation);
  assert.equal(observation.currentState, null);
  assert.equal(diff.changes[0]?.operation, 'add');
  assert.equal(diff.redacted, true);
});

test('same idempotency key and payload never creates a duplicate alert', async () => {
  const adapter = new FakeAlertAdapter();
  const step = buildPlanFixture().steps[0]!;
  const first = await adapter.apply(context(), step);
  const retry = await adapter.apply(context(), step);
  assert.equal(first.status, 'applied');
  assert.equal(retry.status, 'deduplicated');
  assert.equal(first.resourceRef, retry.resourceRef);
  assert.equal(adapter.resourceCount(), 1);
});

test('same idempotency key with changed payload is rejected', async () => {
  const adapter = new FakeAlertAdapter();
  const step = buildPlanFixture().steps[0]!;
  await adapter.apply(context(), step);
  const alert = step.params.alert as Record<string, unknown>;
  const changed = { ...step, params: { alert: { ...alert, thresholdPercent: 10 } } };
  const conflict = await adapter.apply(context(), changed);
  assert.equal(conflict.status, 'failed');
  assert.equal(conflict.error?.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(adapter.resourceCount(), 1);
});

test('verification reads back the resource and can expose a forced mismatch', async () => {
  const adapter = new FakeAlertAdapter();
  const step = buildPlanFixture().steps[0]!;
  const execution = await adapter.apply(context(), step);
  assert.equal((await adapter.verify(context(), step, execution)).status, 'passed');
  adapter.forceVerificationFailure(true);
  assert.equal((await adapter.verify(context(), step, execution)).status, 'failed');
});
```

- [ ] **Step 2: 运行测试，确认 fake adapter 尚不存在**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/fake-alert-adapter.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/adapters/fake-alert-adapter.js'`。

- [ ] **Step 3: 实现 fake adapter**

`agent/src/adapters/fake-alert-adapter.ts`

```ts
import { createHash } from 'node:crypto';
import type {
  ActionStep, AdapterExecutionContext, ExecutionResult, JsonObject,
  ObservationResult, PlanDiff, SreAdapter, VerificationResult,
} from '../contracts/index.js';
import { FAKE_ALERT_CAPABILITY } from '../policy/policy-engine.js';
import { stableStringify } from '../runtime/plan-hash.js';

export interface FakeAlertPolicy {
  id: string;
  service: 'demo-service';
  name: string;
  expression: string;
  thresholdPercent: number;
  evaluationWindowMinutes: number;
  forMinutes: number;
  severity: 'warning';
  enabled: boolean;
}

interface IdempotencyRecord {
  payloadDigest: string;
  result: ExecutionResult;
}

function asJson(value: unknown): JsonObject {
  return structuredClone(value) as JsonObject;
}

function digest(value: JsonObject): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function desiredAlert(step: ActionStep): FakeAlertPolicy {
  const value = step.params.alert;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('alert params are required');
  const alert = value as unknown as FakeAlertPolicy;
  if (
    alert.service !== 'demo-service' || typeof alert.id !== 'string' ||
    typeof alert.expression !== 'string' || typeof alert.thresholdPercent !== 'number'
  ) {
    throw new Error('invalid fake alert params');
  }
  return structuredClone(alert);
}

export class FakeAlertAdapter implements SreAdapter {
  readonly id = 'fake-alert';
  readonly capabilities = [FAKE_ALERT_CAPABILITY];
  private readonly resources = new Map<string, FakeAlertPolicy>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private verificationFailure = false;

  resourceCount(): number { return this.resources.size; }
  forceVerificationFailure(value: boolean): void { this.verificationFailure = value; }

  async inspectCurrentState(context: AdapterExecutionContext, step: ActionStep): Promise<ObservationResult> {
    const resourceId = step.target.resourceId ?? '';
    const current = this.resources.get(resourceId);
    const currentState = current ? asJson(current) : null;
    return {
      stepId: step.id,
      currentState,
      evidence: [{
        id: `evidence-observe-${step.id}`,
        type: 'current_state',
        source: this.id,
        summary: current ? `Alert ${resourceId} exists.` : `Alert ${resourceId} does not exist.`,
        observedAt: context.now,
        sensitivity: 'internal',
        digest: digest(currentState ?? {}),
        artifactRefs: [],
      }],
      artifacts: [],
      observedAt: context.now,
    };
  }

  async previewDiff(
    context: AdapterExecutionContext,
    step: ActionStep,
    observation: ObservationResult,
  ): Promise<PlanDiff> {
    const after = asJson(desiredAlert(step));
    return {
      id: `diff-${step.id}`,
      stepId: step.id,
      target: step.target,
      before: observation.currentState,
      after,
      changes: [{
        path: '/',
        operation: observation.currentState ? 'replace' : 'add',
        before: observation.currentState,
        after,
      }],
      redacted: true,
      generatedAt: context.now,
    };
  }

  async apply(context: AdapterExecutionContext, step: ActionStep): Promise<ExecutionResult> {
    const startedAt = context.now;
    const desired = desiredAlert(step);
    const payload = asJson(desired);
    const payloadDigest = digest(payload);
    const prior = this.idempotency.get(step.idempotencyKey);
    if (prior) {
      if (prior.payloadDigest !== payloadDigest) {
        return {
          stepId: step.id,
          adapterId: this.id,
          idempotencyKey: step.idempotencyKey,
          status: 'failed',
          evidence: [],
          artifacts: [],
          startedAt,
          finishedAt: context.now,
          error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key was reused with a different payload.', retryable: false },
        };
      }
      return { ...structuredClone(prior.result), status: 'deduplicated', startedAt, finishedAt: context.now };
    }

    const existing = this.resources.get(desired.id);
    if (existing && digest(asJson(existing)) !== payloadDigest) {
      return {
        stepId: step.id,
        adapterId: this.id,
        idempotencyKey: step.idempotencyKey,
        status: 'failed',
        evidence: [],
        artifacts: [],
        startedAt,
        finishedAt: context.now,
        error: { code: 'PRECONDITION_FAILED', message: 'An alert with the same id has a different configuration.', retryable: false },
      };
    }

    this.resources.set(desired.id, structuredClone(desired));
    const result: ExecutionResult = {
      stepId: step.id,
      adapterId: this.id,
      idempotencyKey: step.idempotencyKey,
      status: existing ? 'deduplicated' : 'applied',
      resourceRef: desired.id,
      evidence: [{
        id: `evidence-execute-${step.id}`,
        type: 'execution',
        source: this.id,
        summary: `${existing ? 'Reused' : 'Created'} alert ${desired.id}.`,
        observedAt: context.now,
        sensitivity: 'internal',
        digest: payloadDigest,
        artifactRefs: [],
      }],
      artifacts: [],
      startedAt,
      finishedAt: context.now,
    };
    this.idempotency.set(step.idempotencyKey, { payloadDigest, result: structuredClone(result) });
    return result;
  }

  async verify(
    context: AdapterExecutionContext,
    step: ActionStep,
    _execution: ExecutionResult,
  ): Promise<VerificationResult> {
    const expected = desiredAlert(step);
    const actual = this.resources.get(expected.id);
    const passed = !this.verificationFailure && Boolean(actual) && digest(asJson(actual)) === digest(asJson(expected));
    return {
      stepId: step.id,
      status: passed ? 'passed' : 'failed',
      checks: [{
        verificationId: 'verify-alert-matches',
        passed,
        expected: asJson(expected),
        actual: actual ? asJson(actual) : null,
        message: passed ? 'Alert configuration matches the approved plan.' : 'Alert configuration does not match the approved plan.',
      }],
      evidence: [{
        id: `evidence-verify-${step.id}`,
        type: 'verification',
        source: this.id,
        summary: passed ? `Verified alert ${expected.id}.` : `Verification failed for alert ${expected.id}.`,
        observedAt: context.now,
        sensitivity: 'internal',
        digest: digest(actual ? asJson(actual) : {}),
        artifactRefs: [],
      }],
      artifacts: [],
      startedAt: context.now,
      finishedAt: context.now,
      ...(passed ? {} : {
        error: { code: 'VERIFICATION_FAILED' as const, message: 'Read-back verification failed.', retryable: false },
      }),
    };
  }
}
```

- [ ] **Step 4: 运行 adapter 测试和 typecheck**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/fake-alert-adapter.test.ts
npm run agent:typecheck
```

Expected: PASS；测试摘要包含 `4 tests`、`0 fail`。

- [ ] **Step 5: Commit**

```bash
git add agent/src/adapters/fake-alert-adapter.ts agent/tests/fake-alert-adapter.test.ts
git commit -m "feat(agent): add idempotent fake alert adapter"
```

---

### Task 6: 建立脱敏和用户可见事件白名单

**Files:**
- Create: `agent/src/evidence/redact.ts`
- Create: `agent/src/audit/render-user-events.ts`
- Create: `agent/tests/user-visible-events.test.ts`

- [ ] **Step 1: 写失败测试，证明秘密和内部思维字段不可见**

`agent/tests/user-visible-events.test.ts`

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuditEvent } from '../src/contracts/index.js';
import { renderUserVisibleEvents } from '../src/audit/render-user-events.js';
import { redactJson } from '../src/evidence/redact.js';
import { withPlanHash } from '../src/runtime/plan-hash.js';
import { buildPlanFixture } from './support/fixtures.js';

test('recursive redaction removes credential-like keys and values', () => {
  const redacted = redactJson({
    token: 'abc',
    nested: { password: 'hunter2', safe: 'visible' },
    header: 'Bearer very-secret-token',
  });
  const text = JSON.stringify(redacted);
  assert.doesNotMatch(text, /abc|hunter2|very-secret-token/);
  assert.match(text, /visible/);
  assert.match(text, /\[REDACTED\]/);
});

test('renderer uses an allowlist and never emits chain of thought or raw logs', () => {
  const plan = withPlanHash({ ...buildPlanFixture(), status: 'AWAITING_APPROVAL' });
  const audit: AuditEvent & Record<string, unknown> = {
    id: 'audit-event-1',
    auditId: plan.auditId,
    planId: plan.id,
    planHash: plan.planHash,
    type: 'APPROVAL_REQUESTED',
    actor: plan.actor,
    environment: plan.environment,
    capability: 'monitor.alert.create',
    redactedInputSummary: 'Authorization: Bearer very-secret-token',
    outcome: 'info',
    reasonCodes: ['CONFIRM_REQUIRED'],
    evidenceRefs: [],
    artifactRefs: [],
    occurredAt: '2026-08-14T01:00:00.000Z',
    reasoning: 'private chain of thought',
    rawLog: 'Cookie=session-secret',
  };
  const serialized = JSON.stringify(renderUserVisibleEvents(plan, [audit], []));
  assert.doesNotMatch(serialized, /very-secret-token|private chain of thought|session-secret|reasoning|rawLog/);
  assert.match(serialized, /\[REDACTED\]/);
  assert.match(serialized, /audit-event-1/);
});
```

- [ ] **Step 2: 运行测试，确认脱敏模块缺失**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/user-visible-events.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/audit/render-user-events.js'`。

- [ ] **Step 3: 实现递归脱敏**

`agent/src/evidence/redact.ts`

```ts
import type { JsonValue } from '../contracts/index.js';

const SENSITIVE_KEY = /(authorization|cookie|credential|kubeconfig|password|private.?key|secret|token)/i;
const SECRET_VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /Cookie\s*[:=]\s*[^\s,;]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

export function redactText(value: string): string {
  return SECRET_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, '[REDACTED]'),
    value,
  );
}

export function redactJson(value: JsonValue): JsonValue {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactJson(child),
      ]),
    );
  }
  return value;
}
```

- [ ] **Step 4: 实现用户事件白名单投影**

`agent/src/audit/render-user-events.ts`

```ts
import type {
  ActionPlan, AuditEvent, JsonValue, PlanDiff, UserVisibleStepEvent, VerificationResult,
} from '../contracts/index.js';
import { redactJson, redactText } from '../evidence/redact.js';

function visibleStatus(event: AuditEvent): UserVisibleStepEvent['status'] {
  if (event.outcome === 'failure') return 'failure';
  if (event.outcome === 'denied') return 'blocked';
  if (event.toStatus === 'AWAITING_APPROVAL') return 'waiting';
  if (event.outcome === 'success') return 'success';
  if (event.type === 'STEP_STARTED') return 'running';
  return 'pending';
}

function safeDiff(diff: PlanDiff | undefined): PlanDiff | undefined {
  return diff ? redactJson(diff as unknown as JsonValue) as unknown as PlanDiff : undefined;
}

export function renderUserVisibleEvents(
  plan: ActionPlan,
  audits: readonly AuditEvent[],
  verifications: readonly VerificationResult[],
): UserVisibleStepEvent[] {
  return audits.map((event) => {
    const step = event.stepId ? plan.steps.find((item) => item.id === event.stepId) : undefined;
    const policy = step ? plan.policyDecisions.find((item) => item.stepId === step.id) : undefined;
    const diff = step ? plan.diffs.find((item) => item.stepId === step.id) : undefined;
    const verification = step ? verifications.find((item) => item.stepId === step.id) : undefined;
    const renderedDiff = safeDiff(diff);
    const renderedVerification = verification
      ? redactJson(verification as unknown as JsonValue) as unknown as VerificationResult
      : undefined;
    const phase = event.toStatus ?? plan.status;
    const approvalStatus = phase === 'AWAITING_APPROVAL'
      ? 'waiting'
      : phase === 'APPROVED' || phase === 'EXECUTING' || phase === 'VERIFYING' || phase === 'SUCCEEDED'
        ? 'approved'
        : 'not_required';

    return {
      id: `visible-${event.id}`,
      planId: plan.id,
      auditId: plan.auditId,
      phase,
      ...(event.stepId ? { stepId: event.stepId } : {}),
      status: visibleStatus(event),
      message: `${event.type}: ${event.reasonCodes.join(', ') || 'state updated'}`,
      ...(step ? { target: step.target, capability: step.capability } : {}),
      ...(event.redactedInputSummary ? { redactedInputSummary: redactText(event.redactedInputSummary) } : {}),
      ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
      ...(renderedDiff ? { diff: renderedDiff } : {}),
      ...(policy ? { riskLevel: policy.riskLevel } : {}),
      approvalStatus,
      ...(event.outcome === 'denied'
        ? { blocker: { code: event.reasonCodes[0] ?? 'BLOCKED', message: 'Action is blocked by policy or approval.' } }
        : {}),
      ...(renderedVerification ? { verification: renderedVerification } : {}),
      evidenceRefs: [...event.evidenceRefs],
      artifactRefs: [...event.artifactRefs],
      auditEventId: event.id,
      recommendedNextStep: phase === 'AWAITING_APPROVAL'
        ? 'Review the diff and approve the exact plan snapshot.'
        : phase === 'ROLLBACK_REQUIRED'
          ? 'Review and authorize the compensation plan.'
          : phase === 'SUCCEEDED'
            ? 'Monitor the alert evaluation result.'
            : 'Continue with the next plan stage.',
      occurredAt: event.occurredAt,
    };
  });
}
```

- [ ] **Step 5: 运行用户事件测试和 typecheck**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/user-visible-events.test.ts
npm run agent:typecheck
```

Expected: PASS；测试摘要包含 `2 tests`、`0 fail`。

- [ ] **Step 6: Commit**

```bash
git add agent/src/evidence/redact.ts agent/src/audit/render-user-events.ts agent/tests/user-visible-events.test.ts
git commit -m "feat(agent): render redacted action events"
```

---

### Task 7: 编排完整 ActionRuntime vertical slice

**Files:**
- Create: `agent/src/capabilities/alerts/build-create-alert-plan.ts`
- Create: `agent/src/runtime/action-runtime.ts`
- Create: `agent/src/index.ts`
- Create: `agent/tests/action-runtime.test.ts`

- [ ] **Step 1: 写失败测试，锁定 happy path、无确认拒绝、修订失效和复验失败**

`agent/tests/action-runtime.test.ts`

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FakeAlertAdapter } from '../src/adapters/fake-alert-adapter.js';
import { buildCreateAlertPlan } from '../src/capabilities/alerts/build-create-alert-plan.js';
import { PolicyEngine, FAKE_ALERT_CAPABILITY } from '../src/policy/policy-engine.js';
import { ActionRuntime } from '../src/runtime/action-runtime.js';
import { validateApproval } from '../src/runtime/approval-gate.js';
import { InMemoryRuntimeStores } from '../src/runtime/in-memory-stores.js';
import { ACTOR, ENVIRONMENT } from './support/fixtures.js';

function harness() {
  let sequence = 0;
  const now = () => '2026-08-14T01:00:00.000Z';
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;
  const stores = new InMemoryRuntimeStores();
  const adapter = new FakeAlertAdapter();
  const policy = new PolicyEngine([FAKE_ALERT_CAPABILITY], { now, nextId: () => nextId('policy') });
  const runtime = new ActionRuntime(stores, policy, [adapter], { now, nextId });
  const plan = buildCreateAlertPlan({
    planId: 'plan-demo-alert-1',
    auditId: 'audit-demo-alert-1',
    actor: ACTOR,
    environment: ENVIRONMENT,
    service: 'demo-service',
    now: now(),
  });
  return { runtime, stores, adapter, plan };
}

async function advanceToAwaitingApproval(runtime: ActionRuntime, planId: string) {
  await runtime.preflight(planId);
  await runtime.preview(planId);
  return runtime.requestApproval(planId);
}

test('plan follows DRAFT through verified SUCCEEDED and audits every state change', async () => {
  const { runtime, stores, adapter, plan } = harness();
  runtime.registerPlan(plan);
  await advanceToAwaitingApproval(runtime, plan.id);
  runtime.approve(plan.id, ACTOR, ENVIRONMENT, 10 * 60_000);
  const result = await runtime.execute(plan.id, ACTOR, ENVIRONMENT);

  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(adapter.resourceCount(), 1);
  const transitions = stores.listAudits(plan.id).filter((event) => event.type === 'STATE_CHANGED');
  assert.deepEqual(transitions.map((event) => event.toStatus), [
    'PREFLIGHTED', 'PREVIEWED', 'AWAITING_APPROVAL', 'APPROVED',
    'EXECUTING', 'VERIFYING', 'SUCCEEDED',
  ]);
  assert.equal(runtime.getUserVisibleEvents(plan.id).at(-1)?.phase, 'SUCCEEDED');
  assert.equal(runtime.getUserVisibleEvents(plan.id).at(-1)?.auditId, plan.auditId);
});

test('write is rejected when no matching approval exists', async () => {
  const { runtime, adapter, plan } = harness();
  runtime.registerPlan(plan);
  await advanceToAwaitingApproval(runtime, plan.id);
  await assert.rejects(() => runtime.execute(plan.id, ACTOR, ENVIRONMENT), /APPROVAL_REQUIRED/);
  assert.equal(adapter.resourceCount(), 0);
});

test('revising an approved plan revokes the old hash-bound approval immediately', async () => {
  const { runtime, stores, adapter, plan } = harness();
  runtime.registerPlan(plan);
  await advanceToAwaitingApproval(runtime, plan.id);
  const approval = runtime.approve(plan.id, ACTOR, ENVIRONMENT, 10 * 60_000);
  const revised = runtime.reviseStepParams(plan.id, 'step-create-alert', {
    ...plan.steps[0]!.params,
    changeReason: 'Re-preview the approved plan',
  });

  assert.equal(revised.status, 'DRAFT');
  assert.equal(revised.revision, 2);
  assert.equal(
    validateApproval(revised, approval, ACTOR, ENVIRONMENT, '2026-08-14T01:00:00.000Z').valid,
    false,
  );
  assert.ok(stores.listApprovals(plan.id)[0]?.revokedAt);
  await assert.rejects(() => runtime.execute(plan.id, ACTOR, ENVIRONMENT), /APPROVAL_REQUIRED/);
  assert.equal(adapter.resourceCount(), 0);
});

test('failed verification never returns SUCCEEDED', async () => {
  const { runtime, adapter, plan } = harness();
  adapter.forceVerificationFailure(true);
  runtime.registerPlan(plan);
  await advanceToAwaitingApproval(runtime, plan.id);
  runtime.approve(plan.id, ACTOR, ENVIRONMENT, 10 * 60_000);
  const result = await runtime.execute(plan.id, ACTOR, ENVIRONMENT);
  assert.equal(result.status, 'ROLLBACK_REQUIRED');
});

test('agent verify is offline and independent from legacy compare', () => {
  const rootPackage = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> };
  assert.equal(rootPackage.scripts['agent:verify'], 'npm --prefix agent run verify');
  assert.doesNotMatch(rootPackage.scripts['agent:verify'], /v1|v2|compare|replay|curl|http/i);
});
```

- [ ] **Step 2: 运行测试，确认 plan builder/runtime 尚不存在**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/action-runtime.test.ts
```

Expected: FAIL，错误包含 `Cannot find module '../src/runtime/action-runtime.js'`。

- [ ] **Step 3: 实现单一 demo alert 计划构建器**

`agent/src/capabilities/alerts/build-create-alert-plan.ts`

```ts
import type { ActionPlan, ActorRef, EnvironmentRef } from '../../contracts/index.js';
import { POLICY_VERSION } from '../../policy/policy-engine.js';
import { withPlanHash } from '../../runtime/plan-hash.js';

export interface BuildCreateAlertPlanInput {
  planId: string;
  auditId: string;
  actor: ActorRef;
  environment: EnvironmentRef;
  service: 'demo-service';
  now: string;
}

export const DEMO_5XX_ALERT = {
  id: 'alert-policy/demo-service-5xx-error-rate',
  service: 'demo-service',
  name: 'demo-service 5xx error rate',
  expression: 'sum(rate(http_requests_total{service="demo-service",status=~"5.."}[5m])) / clamp_min(sum(rate(http_requests_total{service="demo-service"}[5m])), 1) * 100',
  thresholdPercent: 5,
  evaluationWindowMinutes: 5,
  forMinutes: 10,
  severity: 'warning',
  enabled: true,
} as const;

export function buildCreateAlertPlan(input: BuildCreateAlertPlanInput): ActionPlan {
  if (input.environment.name !== 'demo' || input.environment.tier !== 'development') {
    throw new Error('phase 1 plan builder only accepts the demo development environment');
  }
  const plan: ActionPlan = {
    schemaVersion: '1.0',
    id: input.planId,
    revision: 1,
    planHash: '',
    policyVersion: POLICY_VERSION,
    actor: input.actor,
    environment: input.environment,
    objective: 'Create a 5xx error-rate alert for demo-service',
    status: 'DRAFT',
    steps: [{
      id: 'step-create-alert',
      kind: 'change',
      capability: 'monitor.alert.create',
      capabilityVersion: '1.0',
      target: {
        type: 'alert_policy',
        resourceId: DEMO_5XX_ALERT.id,
        environment: input.environment,
        scope: { service: input.service },
      },
      params: { alert: DEMO_5XX_ALERT },
      mutates: true,
      mutationType: 'create',
      riskLevel: null,
      executionMode: null,
      preconditions: [{
        id: 'alert-absent-or-identical',
        description: 'The alert is absent or already matches the desired configuration.',
        check: 'resource_absent',
        params: { resourceId: DEMO_5XX_ALERT.id },
      }],
      expectedEffects: [{
        description: 'The demo 5xx alert exists with the previewed configuration.',
        resourceType: 'alert_policy',
        resourceId: DEMO_5XX_ALERT.id,
        desiredState: DEMO_5XX_ALERT,
      }],
      verification: [{
        id: 'verify-alert-matches',
        description: 'Read back the alert and compare every desired field.',
        capability: 'monitor.alert.create',
        assertion: 'resource_matches',
        params: { resourceId: DEMO_5XX_ALERT.id, expected: DEMO_5XX_ALERT },
      }],
      rollback: {
        mode: 'compensation',
        supported: false,
        instructions: ['Create a new approved plan to disable or remove the fake alert.'],
        verification: [],
      },
      idempotencyKey: 'alert:create:demo:demo-service:5xx:v1',
      dependencies: [],
      status: 'PENDING',
    }],
    diffs: [],
    policyDecisions: [],
    evidence: [],
    artifacts: [],
    approvalIds: [],
    auditId: input.auditId,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return withPlanHash(plan);
}
```

- [ ] **Step 4: 实现 ActionRuntime 生命周期和审计门禁**

`agent/src/runtime/action-runtime.ts`

```ts
import type {
  ActionPlan, ActionPlanStatus, ActionStep, ActorRef, ApprovalRecord,
  AuditEvent, AuditEventType, EnvironmentRef, JsonObject, SreAdapter,
  PlanDiff, PolicyDecision,
} from '../contracts/index.js';
import { renderUserVisibleEvents } from '../audit/render-user-events.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { createApproval, revokeApproval, validateApproval } from './approval-gate.js';
import { runtimeError } from './errors.js';
import { InMemoryRuntimeStores } from './in-memory-stores.js';
import { withPlanHash } from './plan-hash.js';
import { canRevisePlan, transitionPlan } from './state-machine.js';

export interface ActionRuntimeOptions {
  now: () => string;
  nextId: (prefix: string) => string;
}

interface AuditInput {
  type: AuditEventType;
  outcome: AuditEvent['outcome'];
  reasonCodes: readonly string[];
  fromStatus?: ActionPlanStatus;
  toStatus?: ActionPlanStatus;
  step?: ActionStep;
  evidenceRefs?: readonly string[];
  artifactRefs?: readonly string[];
  durationMs?: number;
}

function updateStep(plan: ActionPlan, stepId: string, patch: Partial<ActionStep>): ActionPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => step.id === stepId ? { ...step, ...patch } : step),
  };
}

function orderedSteps(steps: readonly ActionStep[]): ActionStep[] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: ActionStep[] = [];
  const visit = (step: ActionStep): void => {
    if (visiting.has(step.id)) throw runtimeError('PRECONDITION_FAILED', `dependency cycle at ${step.id}`);
    if (visited.has(step.id)) return;
    visiting.add(step.id);
    for (const dependency of step.dependencies) {
      const required = byId.get(dependency);
      if (!required) throw runtimeError('PRECONDITION_FAILED', `missing dependency ${dependency}`);
      visit(required);
    }
    visiting.delete(step.id);
    visited.add(step.id);
    result.push(step);
  };
  steps.forEach(visit);
  return result;
}

export class ActionRuntime {
  private readonly adaptersByCapability = new Map<string, SreAdapter>();

  constructor(
    private readonly stores: InMemoryRuntimeStores,
    private readonly policy: PolicyEngine,
    adapters: readonly SreAdapter[],
    private readonly options: ActionRuntimeOptions,
  ) {
    for (const adapter of adapters) {
      for (const capability of adapter.capabilities) {
        if (this.adaptersByCapability.has(capability.id)) {
          throw new Error(`duplicate adapter capability ${capability.id}`);
        }
        this.adaptersByCapability.set(capability.id, adapter);
      }
    }
  }

  private requirePlan(planId: string): ActionPlan {
    const plan = this.stores.getPlan(planId);
    if (!plan) throw new Error(`plan ${planId} was not found`);
    return plan;
  }

  private requireAdapter(step: ActionStep): SreAdapter {
    const adapter = this.adaptersByCapability.get(step.capability);
    if (!adapter) throw runtimeError('POLICY_DENIED', `no adapter for ${step.capability}`);
    return adapter;
  }

  private appendAudit(plan: ActionPlan, input: AuditInput): void {
    const event: AuditEvent = {
      id: this.options.nextId('audit-event'),
      auditId: plan.auditId,
      planId: plan.id,
      planHash: plan.planHash,
      type: input.type,
      ...(input.fromStatus ? { fromStatus: input.fromStatus } : {}),
      ...(input.toStatus ? { toStatus: input.toStatus } : {}),
      ...(input.step ? {
        stepId: input.step.id,
        capability: input.step.capability,
        redactedInputSummary: `${input.step.kind} ${input.step.target.type} ${input.step.target.resourceId ?? ''}`.trim(),
      } : {}),
      actor: plan.actor,
      environment: plan.environment,
      outcome: input.outcome,
      reasonCodes: input.reasonCodes,
      evidenceRefs: input.evidenceRefs ?? [],
      artifactRefs: input.artifactRefs ?? [],
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
      occurredAt: this.options.now(),
    };
    this.stores.appendAudit(event);
  }

  private transition(
    plan: ActionPlan,
    nextStatus: ActionPlanStatus,
    outcome: AuditEvent['outcome'],
    reasonCodes: readonly string[],
  ): ActionPlan {
    const next = transitionPlan(plan, nextStatus, this.options.now());
    this.appendAudit(next, {
      type: 'STATE_CHANGED',
      outcome,
      reasonCodes,
      fromStatus: plan.status,
      toStatus: nextStatus,
    });
    this.stores.savePlan(next);
    return next;
  }

  registerPlan(source: ActionPlan): ActionPlan {
    if (source.status !== 'DRAFT' || this.stores.getPlan(source.id)) {
      throw new Error('only a new DRAFT plan can be registered');
    }
    const plan = withPlanHash(source);
    this.appendAudit(plan, { type: 'PLAN_CREATED', outcome: 'info', reasonCodes: ['PLAN_REGISTERED'] });
    this.stores.savePlan(plan);
    return plan;
  }

  async preflight(planId: string): Promise<ActionPlan> {
    let plan = this.requirePlan(planId);
    if (plan.status !== 'DRAFT') throw runtimeError('INVALID_TRANSITION', 'preflight requires DRAFT');
    const decisions: PolicyDecision[] = [];
    for (const original of orderedSteps(plan.steps)) {
      const decision = this.policy.evaluate(plan, original);
      decisions.push(decision);
      plan = updateStep(plan, original.id, {
        riskLevel: decision.riskLevel,
        executionMode: decision.executionMode,
        status: decision.allowed ? 'READY' : 'BLOCKED',
      });
      plan = { ...plan, policyDecisions: decisions };
      this.appendAudit(plan, {
        type: 'POLICY_EVALUATED',
        outcome: decision.allowed ? 'allowed' : 'denied',
        reasonCodes: decision.reasonCodes,
        step: plan.steps.find((step) => step.id === original.id)!,
      });
      if (!decision.allowed) {
        this.stores.savePlan(plan);
        return this.transition(plan, 'BLOCKED', 'denied', decision.reasonCodes);
      }
      const step = plan.steps.find((item) => item.id === original.id)!;
      const observation = await this.requireAdapter(step).inspectCurrentState({
        planId: plan.id,
        planHash: plan.planHash,
        actor: plan.actor,
        environment: plan.environment,
        now: this.options.now(),
      }, step);
      this.stores.saveObservation(plan.id, observation);
      plan = {
        ...plan,
        evidence: [...plan.evidence, ...observation.evidence],
        artifacts: [...plan.artifacts, ...observation.artifacts],
      };
    }
    plan = withPlanHash(plan);
    this.stores.savePlan(plan);
    return this.transition(plan, 'PREFLIGHTED', 'success', ['PREFLIGHT_PASSED']);
  }

  async preview(planId: string): Promise<ActionPlan> {
    let plan = this.requirePlan(planId);
    if (plan.status !== 'PREFLIGHTED') throw runtimeError('INVALID_TRANSITION', 'preview requires PREFLIGHTED');
    const diffs: PlanDiff[] = [];
    for (const step of orderedSteps(plan.steps)) {
      const observation = this.stores.getObservation(plan.id, step.id);
      if (!observation) throw runtimeError('PRECONDITION_FAILED', `missing observation for ${step.id}`);
      const diff = await this.requireAdapter(step).previewDiff({
        planId: plan.id,
        planHash: plan.planHash,
        actor: plan.actor,
        environment: plan.environment,
        now: this.options.now(),
      }, step, observation);
      diffs.push(diff);
    }
    plan = withPlanHash({ ...plan, diffs });
    this.stores.savePlan(plan);
    const previewed = this.transition(plan, 'PREVIEWED', 'success', ['DIFF_READY']);
    for (const step of previewed.steps) {
      const diff = previewed.diffs.find((item) => item.stepId === step.id);
      this.appendAudit(previewed, {
        type: 'DIFF_PREVIEWED',
        outcome: 'info',
        reasonCodes: ['REDACTED_DIFF_READY'],
        step,
        artifactRefs: diff ? [diff.id] : [],
      });
    }
    return previewed;
  }

  requestApproval(planId: string): ActionPlan {
    let plan = this.requirePlan(planId);
    if (plan.status !== 'PREVIEWED') throw runtimeError('INVALID_TRANSITION', 'approval request requires PREVIEWED');
    plan = withPlanHash(plan);
    this.stores.savePlan(plan);
    const awaiting = this.transition(plan, 'AWAITING_APPROVAL', 'info', ['CONFIRM_REQUIRED']);
    this.appendAudit(awaiting, {
      type: 'APPROVAL_REQUESTED',
      outcome: 'info',
      reasonCodes: ['PLAN_HASH_BOUND'],
    });
    return awaiting;
  }

  approve(
    planId: string,
    actor: ActorRef,
    environment: EnvironmentRef,
    ttlMs: number,
  ): ApprovalRecord {
    let plan = this.requirePlan(planId);
    const issuedAt = this.options.now();
    const approval = createApproval(plan, {
      id: this.options.nextId('approval'),
      actor,
      environment,
      issuedAt,
      expiresAt: new Date(Date.parse(issuedAt) + ttlMs).toISOString(),
    });
    this.stores.saveApproval(approval);
    plan = { ...plan, approvalIds: [...plan.approvalIds, approval.id] };
    this.stores.savePlan(plan);
    plan = this.transition(plan, 'APPROVED', 'allowed', ['APPROVAL_VALID']);
    this.appendAudit(plan, {
      type: 'APPROVAL_RECORDED',
      outcome: 'allowed',
      reasonCodes: ['PLAN_HASH_ACTOR_ENVIRONMENT_TTL_MATCH'],
    });
    return approval;
  }

  reviseStepParams(planId: string, stepId: string, params: JsonObject): ActionPlan {
    const current = this.requirePlan(planId);
    if (!canRevisePlan(current.status)) throw runtimeError('INVALID_TRANSITION', 'plan cannot be revised after execution starts');
    const now = this.options.now();
    for (const approval of this.stores.listApprovals(planId)) {
      if (!approval.revokedAt) {
        this.stores.replaceApproval(revokeApproval(approval, now, 'plan_changed'));
        this.appendAudit(current, {
          type: 'APPROVAL_REVOKED',
          outcome: 'info',
          reasonCodes: ['PLAN_CHANGED'],
        });
      }
    }
    const revisedSteps = current.steps.map((step) => step.id === stepId
      ? { ...step, params, riskLevel: null, executionMode: null, status: 'PENDING' as const }
      : step);
    if (!revisedSteps.some((step) => step.id === stepId)) throw new Error(`step ${stepId} was not found`);
    const revised = withPlanHash({
      ...current,
      revision: current.revision + 1,
      status: 'DRAFT',
      steps: revisedSteps,
      diffs: [],
      policyDecisions: [],
      evidence: [],
      artifacts: [],
      approvalIds: [],
      updatedAt: now,
    });
    this.appendAudit(revised, {
      type: 'PLAN_REVISED',
      outcome: 'info',
      reasonCodes: ['PLAN_CONTENT_CHANGED'],
    });
    if (current.status !== 'DRAFT') {
      this.appendAudit(revised, {
        type: 'STATE_CHANGED',
        outcome: 'info',
        reasonCodes: ['REVISION_RESTARTS_LIFECYCLE'],
        fromStatus: current.status,
        toStatus: 'DRAFT',
      });
    }
    this.stores.savePlan(revised);
    return revised;
  }

  async execute(planId: string, actor: ActorRef, environment: EnvironmentRef): Promise<ActionPlan> {
    let plan = this.requirePlan(planId);
    if (plan.status !== 'APPROVED') throw runtimeError('APPROVAL_REQUIRED', 'execution requires APPROVED state');

    for (const step of orderedSteps(plan.steps)) {
      const currentDecision = this.policy.evaluate(plan, step);
      if (!currentDecision.allowed) return this.transition(plan, 'BLOCKED', 'denied', currentDecision.reasonCodes);
      if (currentDecision.riskLevel !== step.riskLevel || currentDecision.executionMode !== step.executionMode) {
        plan = withPlanHash(updateStep(plan, step.id, {
          riskLevel: currentDecision.riskLevel,
          executionMode: currentDecision.executionMode,
        }));
        this.stores.savePlan(plan);
        for (const approval of this.stores.listApprovals(plan.id)) {
          if (!approval.revokedAt) {
            this.stores.replaceApproval(revokeApproval(approval, this.options.now(), 'policy_changed'));
            this.appendAudit(plan, {
              type: 'APPROVAL_REVOKED',
              outcome: 'info',
              reasonCodes: ['POLICY_CHANGED'],
            });
          }
        }
        return this.transition(plan, 'AWAITING_APPROVAL', 'info', ['POLICY_CHANGED_REAPPROVAL_REQUIRED']);
      }
    }

    const approval = this.stores.listApprovals(plan.id).find((item) =>
      validateApproval(plan, item, actor, environment, this.options.now()).valid,
    );
    if (!approval) throw runtimeError('APPROVAL_INVALID', 'no valid approval matches this plan snapshot');

    plan = this.transition(plan, 'EXECUTING', 'info', ['EXECUTION_STARTED']);
    for (const ordered of orderedSteps(plan.steps)) {
      plan = updateStep(plan, ordered.id, { status: 'RUNNING' });
      this.stores.savePlan(plan);
      const step = plan.steps.find((item) => item.id === ordered.id)!;
      this.appendAudit(plan, { type: 'STEP_STARTED', outcome: 'info', reasonCodes: ['ADAPTER_APPLY'], step });
      const execution = await this.requireAdapter(step).apply({
        planId: plan.id,
        planHash: plan.planHash,
        actor,
        environment,
        now: this.options.now(),
      }, step);
      this.stores.saveExecution(plan.id, execution);
      plan = updateStep(plan, step.id, { status: execution.status === 'failed' ? 'FAILED' : 'APPLIED' });
      plan = {
        ...plan,
        evidence: [...plan.evidence, ...execution.evidence],
        artifacts: [...plan.artifacts, ...execution.artifacts],
      };
      this.stores.savePlan(plan);
      this.appendAudit(plan, {
        type: 'STEP_FINISHED',
        outcome: execution.status === 'failed' ? 'failure' : 'success',
        reasonCodes: [execution.status.toUpperCase()],
        step: plan.steps.find((item) => item.id === step.id)!,
        evidenceRefs: execution.evidence.map((item) => item.id),
        artifactRefs: execution.artifacts.map((item) => item.id),
      });
      if (execution.status === 'failed') return this.transition(plan, 'FAILED', 'failure', [execution.error?.code ?? 'ADAPTER_ERROR']);
    }

    plan = this.transition(plan, 'VERIFYING', 'info', ['EXECUTION_RESULTS_AVAILABLE']);
    for (const ordered of orderedSteps(plan.steps)) {
      const execution = this.stores.getExecution(plan.id, ordered.id);
      if (!execution) throw runtimeError('ADAPTER_ERROR', `missing execution result for ${ordered.id}`);
      plan = updateStep(plan, ordered.id, { status: 'VERIFYING' });
      this.stores.savePlan(plan);
      const step = plan.steps.find((item) => item.id === ordered.id)!;
      const verification = await this.requireAdapter(step).verify({
        planId: plan.id,
        planHash: plan.planHash,
        actor,
        environment,
        now: this.options.now(),
      }, step, execution);
      this.stores.saveVerification(plan.id, verification);
      plan = updateStep(plan, step.id, {
        status: verification.status === 'passed' ? 'SUCCEEDED' : 'ROLLBACK_REQUIRED',
      });
      plan = {
        ...plan,
        evidence: [...plan.evidence, ...verification.evidence],
        artifacts: [...plan.artifacts, ...verification.artifacts],
      };
      this.stores.savePlan(plan);
      this.appendAudit(plan, {
        type: 'VERIFICATION_FINISHED',
        outcome: verification.status === 'passed' ? 'success' : 'failure',
        reasonCodes: [verification.status === 'passed' ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED'],
        step: plan.steps.find((item) => item.id === step.id)!,
        evidenceRefs: verification.evidence.map((item) => item.id),
        artifactRefs: verification.artifacts.map((item) => item.id),
      });
      if (verification.status !== 'passed') {
        return this.transition(plan, 'ROLLBACK_REQUIRED', 'failure', ['SIDE_EFFECT_REQUIRES_COMPENSATION']);
      }
    }
    return this.transition(plan, 'SUCCEEDED', 'success', ['ALL_VERIFICATIONS_PASSED']);
  }

  getUserVisibleEvents(planId: string) {
    const plan = this.requirePlan(planId);
    return renderUserVisibleEvents(plan, this.stores.listAudits(planId), this.stores.listVerifications(planId));
  }
}
```

- [ ] **Step 5: 创建不暴露 adapter 的公开 facade**

`agent/src/index.ts`

```ts
import { FakeAlertAdapter } from './adapters/fake-alert-adapter.js';
import { buildCreateAlertPlan } from './capabilities/alerts/build-create-alert-plan.js';
import type {
  ActionPlan, ActorRef, ApprovalRecord, EnvironmentRef, JsonObject, UserVisibleStepEvent,
} from './contracts/index.js';
import { FAKE_ALERT_CAPABILITY, PolicyEngine } from './policy/policy-engine.js';
import { ActionRuntime } from './runtime/action-runtime.js';
import { InMemoryRuntimeStores } from './runtime/in-memory-stores.js';

export * from './contracts/index.js';

export interface SreCoreRuntime {
  createDemoAlertPlan(input: {
    actor: ActorRef;
    environment: EnvironmentRef;
    service: 'demo-service';
  }): ActionPlan;
  preflight(planId: string): Promise<ActionPlan>;
  preview(planId: string): Promise<ActionPlan>;
  requestApproval(planId: string): ActionPlan;
  approve(input: {
    planId: string;
    actor: ActorRef;
    environment: EnvironmentRef;
    ttlMs: number;
  }): ApprovalRecord;
  reviseStepParams(planId: string, stepId: string, params: JsonObject): ActionPlan;
  execute(planId: string, actor: ActorRef, environment: EnvironmentRef): Promise<ActionPlan>;
  getUserVisibleEvents(planId: string): readonly UserVisibleStepEvent[];
}

export interface CreatePhase1CoreOptions {
  now?: () => string;
  nextId?: (prefix: string) => string;
}

export function createPhase1Core(options: CreatePhase1CoreOptions = {}): SreCoreRuntime {
  let sequence = 0;
  const now = options.now ?? (() => new Date().toISOString());
  const nextId = options.nextId ?? ((prefix: string) => `${prefix}-${++sequence}`);
  const stores = new InMemoryRuntimeStores();
  const adapter = new FakeAlertAdapter();
  const policy = new PolicyEngine([FAKE_ALERT_CAPABILITY], { now, nextId: () => nextId('policy') });
  const runtime = new ActionRuntime(stores, policy, [adapter], { now, nextId });

  return {
    createDemoAlertPlan(input) {
      const plan = buildCreateAlertPlan({
        planId: nextId('plan'),
        auditId: nextId('audit'),
        actor: input.actor,
        environment: input.environment,
        service: input.service,
        now: now(),
      });
      return runtime.registerPlan(plan);
    },
    preflight: (planId) => runtime.preflight(planId),
    preview: (planId) => runtime.preview(planId),
    requestApproval: (planId) => runtime.requestApproval(planId),
    approve: (input) => runtime.approve(
      input.planId, input.actor, input.environment, input.ttlMs,
    ),
    reviseStepParams: (planId, stepId, params) => runtime.reviseStepParams(planId, stepId, params),
    execute: (planId, actor, environment) => runtime.execute(planId, actor, environment),
    getUserVisibleEvents: (planId) => runtime.getUserVisibleEvents(planId),
  };
}
```

- [ ] **Step 6: 运行 vertical slice 定向测试**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/action-runtime.test.ts
```

Expected: PASS；测试摘要包含 `5 tests`、`0 fail`。happy path 最终为 `SUCCEEDED`；故障注入路径最终为 `ROLLBACK_REQUIRED`。

- [ ] **Step 7: 运行完整独立 gate**

Run:

```bash
npm run agent:verify
```

Expected: PASS；先完成 strict TypeScript typecheck，再运行 `agent/tests/*.test.ts`，总计 `23 tests`、`0 fail`。输出不包含 V1/V2 compare、网络或历史报告读取。

- [ ] **Step 8: 确认旧 V2 没有被修改**

Run:

```bash
git diff --name-only origin/main...HEAD
git status --short
```

Expected: 已提交差异只包含 `agent/**` 与根 `package.json`；尚未提交的现场只允许出现本轮设计、计划、索引和变更记录文档；两条输出均不包含 `v2/` 或 `.pi/`。

- [ ] **Step 9: Commit**

```bash
git add agent/src/capabilities/alerts/build-create-alert-plan.ts agent/src/runtime/action-runtime.ts agent/src/index.ts agent/tests/action-runtime.test.ts
git commit -m "feat(agent): execute verified alert action plans"
```

---

### Task 8: 固化验收报告和文档入口

**Files:**
- Create: `agent/tests/documentation-guard.test.ts`
- Create: `docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD`
- Modify: `docs/DOCS-INDEX.MD`
- Modify: `CHANGELOG.MD`

- [ ] **Step 1: 写失败测试，要求验收报告、索引和变更记录同时存在**

`agent/tests/documentation-guard.test.ts`

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('phase 1 acceptance is traceable from the repository documentation', () => {
  const report = readRepoFile('docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD');
  const index = readRepoFile('docs/DOCS-INDEX.MD');
  const changelog = readRepoFile('CHANGELOG.MD');
  assert.match(report, /npm run agent:verify/);
  assert.match(report, /24 tests.*0 fail/);
  assert.match(report, /legacy baseline issue/i);
  assert.match(index, /AGENT-CORE-PHASE-1-ACCEPTANCE\.MD/);
  assert.match(changelog, /Pi Core Phase 1/);
});
```

- [ ] **Step 2: 运行测试，确认验收报告尚不存在**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/documentation-guard.test.ts
```

Expected: FAIL，错误包含 `ENOENT` 和 `AGENT-CORE-PHASE-1-ACCEPTANCE.MD`。

- [ ] **Step 3: 在完整 gate 通过后写入验收报告**

`docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD`

```markdown
# Agent Core Phase 1 验收记录

> 验收范围：`demo-service` 5xx 告警 fake vertical slice<br>
> 结果：PASS<br>
> 环境：Node.js 20+，离线，无 LLM、网络、历史报告或真实 adapter

## 命令与结果

| 命令 | 结果 |
|---|---|
| `npm run agent:typecheck` | PASS |
| `npm run agent:test` | PASS，24 tests，0 fail |
| `npm run agent:verify` | PASS |

## 验收结论

1. ActionPlan 可按 `DRAFT -> PREFLIGHTED -> PREVIEWED -> AWAITING_APPROVAL -> APPROVED -> EXECUTING -> VERIFYING -> SUCCEEDED` 流转。
2. 无匹配 planHash、actor、environment 和有效期的确认时，adapter apply 不会被调用。
3. 修订计划会改变 hash、撤销旧确认并回到 `DRAFT`。
4. 同一 idempotencyKey 与载荷的重试只保留一个 fake 告警；同键异载荷被拒绝。
5. fake adapter apply 结果可读回复验。
6. 复验失败时计划进入 `ROLLBACK_REQUIRED`，不会返回 `SUCCEEDED`。
7. 每次状态变化都有对应 `STATE_CHANGED` AuditEvent。
8. 用户可见事件未包含凭证、原始敏感日志或内部思维字段。
9. `agent:verify` 不依赖 V1/V2 compare、LLM、网络或历史生成物。
10. `v2/` 与 `.pi/` 未修改。

## Legacy baseline issue

旧验证链在干净环境缺少历史 V1 replay 报告时可能由 `compare-v1-v2.ts` 抛错。本阶段没有伪造报告、跳过失败或修改旧 V2；新 core 使用独立 `agent:verify`。
```

只有前三条命令实际全部通过后，才能按上述内容将结果写为 PASS。如果任一命令失败，先修复根因并重新运行，不创建虚假的成功记录。

- [ ] **Step 4: 更新统一文档入口和变更记录**

在 `docs/DOCS-INDEX.MD` 的“验证 / 测试”段加入：

```markdown
- `docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD` - Pi Core 第一阶段 fake 告警 vertical slice 离线验收记录
```

在 `CHANGELOG.MD` 的未发布段顶部加入：

```markdown
### 🧭 Pi Core Phase 1（2026-08-14）

- **独立核心**: 新增 `agent/` TypeScript core，完成 `demo-service` 5xx 告警 fake vertical slice，不修改旧 `v2/`。
- **写入治理**: 落地 ActionPlan 状态机、确定性 policy、planHash 确认、幂等 adapter、复验、审计和用户事件脱敏。
- **独立验收**: 新增 `npm run agent:verify`，离线执行 24 项测试，不依赖 LLM、网络、历史报告或 V1/V2 compare。
- **基线隔离**: 保留并记录旧 compare 在缺少历史 V1 replay 报告时的 legacy baseline issue，本阶段未修改旧 V2。
```

- [ ] **Step 5: 运行文档 guard 和完整 gate**

Run:

```bash
./node_modules/.bin/tsx --test agent/tests/documentation-guard.test.ts
npm run agent:verify
```

Expected: 两条命令均 PASS；完整测试摘要包含 `24 tests`、`0 fail`。

- [ ] **Step 6: 检查 Markdown 命名、禁用字样和范围**

Run:

```bash
find agent docs/design docs/superpowers docs/verification -type f -name '*.md' -print
if rg -n 'T[O]DO' docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD docs/superpowers/plans/2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD; then exit 1; fi
git diff --name-only origin/main...HEAD
git status --short
```

Expected:

- 第一条命令无输出，新建 Markdown 文件扩展名均为 `.MD`。
- 第二条命令无匹配且退出 0。
- Git 差异只包含 `agent/**`、`package.json`、本设计、实施计划、验收报告、`docs/DOCS-INDEX.MD` 和 `CHANGELOG.MD`。
- 输出不包含 `v2/`、`.pi/`、真实环境配置或凭证文件。

- [ ] **Step 7: Commit**

```bash
git add agent/tests/documentation-guard.test.ts docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD docs/superpowers/plans/2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD docs/verification/AGENT-CORE-PHASE-1-ACCEPTANCE.MD docs/DOCS-INDEX.MD CHANGELOG.MD
git commit -m "docs: record agent core phase 1 acceptance"
```

- [ ] **Step 8: 最终验收并停下等待审阅**

Run:

```bash
npm run agent:verify
git status --short --branch
```

Expected: `agent:verify` PASS，测试摘要为 `24 tests`、`0 fail`；Git 工作树干净，分支仍为 `codex/pi-sre-core`。不要自动安装 Pi、创建 `.pi/`、提交额外变更或推送。

---

## Self-review checklist

实施者在每个 task 后检查对应项，在 Task 8 再检查全部：

- [ ] 第一阶段仍只有 `demo-service` 5xx 告警创建这一个 vertical slice。
- [ ] `OperationKind`、`ExecutionMode`、`RiskLevel` 和状态名称在合同、runtime、测试及文档中一致。
- [ ] 写操作没有绕过 `ActionPlan`、`PolicyEngine` 或 approval gate。
- [ ] 确认精确绑定 planId、planHash、actor、environment 和 expiry。
- [ ] plan 修改后旧确认被撤销并无法通过 `validateApproval`。
- [ ] 同键同载荷去重，同键异载荷拒绝。
- [ ] verification failure 的最终状态不是 `SUCCEEDED`。
- [ ] 每个状态变化都有一条 `STATE_CHANGED` audit。
- [ ] 用户可见事件不含秘密、原始日志或内部思维字段。
- [ ] `npm run agent:verify` 不调用旧 V1/V2 compare。
- [ ] `v2/` 和 `.pi/` 没有变更。
- [ ] 未安装依赖、未连接网络或生产环境。

## Pi integration handoff

第一阶段实现完成并得到设计批准后，另开接入计划处理 `.pi/extensions/sre-copilot.ts`。该计划必须先确认 Pi SDK 的官方 extension/tool/approval API 和版本，再让 extension 只调用 `createPhase1Core()` 返回的 `SreCoreRuntime`；不得导入 `FakeAlertAdapter`、`PolicyEngine` 或内存 store。当前计划到 Task 8 即结束。
