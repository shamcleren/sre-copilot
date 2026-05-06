# Knowledge Adapter 设计规格

> 日期：2026-03-31
> 状态：设计已确认，待实现
> 目标：以最小增量方式，把 `knowledge` 从“可规划但不可执行”升级为“可规划且可执行”，并完整纳入现有 `V2 runtime` 的 `toolExecutions / evidence / blocker / conclusion / regression` 闭环。

## 1. 背景

当前 `V2` 已经完成主运行时收口，`playbook`、`policy`、`runtime` 与 `replay` 的主链已经稳定：

- `v2/src/playbooks/troubleshooting.playbook.ts` 已允许 `knowledge / k8s / ssh`
- `v2/src/policies/telemetry-first.policy.ts` 已在启动失败/配置线索场景规划 `knowledge`
- `v2/src/runtime/execute-case.ts` 已能把 adapter 返回结果归一为 `tool_result / tool_failure / blocker`
- `v2/src/runtime/build-conclusion.ts` 已能基于 blocker 输出结构化结论

但当前真实可执行 adapter 基本只有 `unify_query`；`knowledge` 虽然已经出现在规划与合同层中，却仍未形成真实执行闭环。占位 adapter 会把此类调用落成 `adapter_unavailable`，这意味着：

1. `knowledge` 仍然只是“规划层能力”，不是“执行层能力”
2. 运行时结论会被迫停在“adapter 尚未接入”
3. `knowledge` 还没有被纳入真实 blocker / evidence / regression 语义中

因此，本轮设计的重点不是继续扩展新的规划规则，而是把现有已规划的 `knowledge` 工具类正式接通为真实执行能力。

## 2. 设计目标

### 2.1 目标

本设计希望达成以下效果：

- 在 `V2` 中新增一个真实的 `knowledge` adapter
- 让 `search_knowledge` / `mcp_search_knowledge` 不再走占位 adapter
- 让 `knowledge` 工具执行结果复用现有 `RuntimeToolExecution` 合同
- 让成功、空结果、超时、鉴权失败、权限不足、普通错误等情形都进入现有 blocker 归一流程
- 让 `knowledge` 正式进入当前 `V2` regression / contract 验收体系

### 2.2 非目标

本设计暂不覆盖以下事项：

- 不在本轮重写 `executeCase()` 主流程
- 不在本轮引入完整多 adapter registry
- 不在本轮接通 `k8s / ssh` 的真实执行器
- 不在本轮重做知识检索排序策略与召回算法
- 不在本轮扩展新的 `knowledge` 工具命名，只先支持现有 `search_knowledge` / `mcp_search_knowledge`

## 3. 方案比较与推荐

### 3.1 方案 A：最小闭环型 `knowledge` adapter（推荐）

做法：只接 `knowledge` 一类工具，把 `search_knowledge` / `mcp_search_knowledge` 从占位执行改为真实执行，并补齐最小测试与合同。

优点：

- 改动最小
- 风险最低
- 能最快形成非 `unify_query` adapter 的真实闭环
- 不破坏当前 `telemetry-first` 主链

缺点：

- `k8s / ssh` 仍然保留占位状态
- 后续若要接更多 adapter，仍需继续补结构

### 3.2 方案 B：先做 adapter registry，再接 `knowledge`

做法：先把 runtime 的 adapter 注入升级为按 `toolClass` 分发，再让 `knowledge` 成为第一个真实接入的非 `unify_query` adapter。

优点：

- 长期结构更完整
- 为后续 `k8s / ssh` 扩展预留更清晰的接线方式

缺点：

- 本轮范围明显扩大
- 会把“补执行能力”问题变成“补执行能力 + 重构 runtime”问题

### 3.3 方案 C：一次性做 `knowledge + k8s + ssh` 统一骨架

做法：本轮同时为三类工具建立统一接入骨架，其中 `knowledge` 真实接通，`k8s / ssh` 先做严格只读或半占位实现。

优点：

- 一次把结构铺完整
- 后续扩展时边界更明确

缺点：

- 范围过大，容易超出本轮控制面
- 最容易影响当前已经稳定的 `V2` runtime

### 3.4 推荐结论

本设计选择**方案 A**：

- 先交付一个真实可执行的 `knowledge` adapter MVP
- 保持 `runtime` 主流程不变
- 保持 blocker / evidence / conclusion 合同不变
- 仅通过最小增量让 `knowledge` 正式纳入现有闭环

## 4. 边界与职责

### 4.1 本轮要做的

- 在 `v2/src/adapters/` 下新增 `knowledge` adapter
- 让 `knowledge` 工具类不再落到 `noopAdapter`
- 补齐 `toolName -> toolClass` 的 `knowledge` 映射
- 让 adapter 返回值完全复用 `RuntimeToolExecution`
- 补齐成功/空结果/失败路径测试

### 4.2 本轮不做的

- 不改变 `prepareCase -> executeCaseWithAdapter -> finalizeRuntimeResult` 主链
- 不改变 `telemetry-first` 的首跳策略
- 不新建 `knowledge` 专属结论分支
- 不接入新的 `toolClass`
- 不处理知识库文档索引、embedding、排序优化等系统级改造

### 4.3 职责边界

- **runtime 层**：负责规划、归一 blocker、生成结论
- **knowledge adapter**：负责把 `RuntimeToolCall` 翻译成真实知识检索执行，并返回标准化 `RuntimeToolExecution`
- **知识检索执行器**：负责真正访问知识检索能力，可为 MCP、本地函数或其他只读实现

关键原则是：**adapter 负责执行，runtime 负责编排**。`knowledge` 不应成为 runtime 内部特例。

## 5. 组件结构与数据流

### 5.1 建议组件

建议本轮只新增和调整以下组件：

1. `v2/src/adapters/knowledge.ts`
2. `v2/src/adapters/index.ts`
3. `v2/src/runtime/execute-case.ts`（小范围映射增强）
4. `v2/tests/runtime-regression.test.ts`

### 5.2 `knowledge.ts` 职责

`knowledge.ts` 负责：

- 暴露 `createKnowledgeRuntimeAdapter()`
- 识别支持的工具名
- 参数透传与最小校验
- 调用底层知识检索执行器
- 把结果映射成 `RuntimeToolExecution`

### 5.3 数据流

固定数据流如下：

1. `modelTurn()` / `policy` 识别当前场景可规划 `knowledge`
2. `executeCase()` 保留属于 `knowledge` 的 `toolRequests`
3. `knowledge adapter` 执行真实知识查询
4. adapter 返回标准 `RuntimeToolExecution`
5. `execute-case.ts` 继续复用现有逻辑：
   - 成功且有数据 → `tool_result`
   - 成功但空结果 → `empty_result`
   - 失败 → blocker 归一
6. `buildConclusion()` 基于 blocker / evidence 输出结构化结论

## 6. 接口设计

### 6.1 对外接口

本轮不改 `RuntimeAdapter` 合同，新增 adapter 工厂：

```ts
export function createKnowledgeRuntimeAdapter(): RuntimeAdapter
```

### 6.2 内部抽象

建议把 `knowledge adapter` 内部拆成两层：

- adapter 工厂层：面向 runtime
- 底层执行函数层：面向真实知识查询

建议的内部数据抽象如下：

```ts
interface KnowledgeSearchResultItem {
  title?: string;
  snippet?: string;
  source?: string;
  score?: number;
}

interface KnowledgeToolResult {
  items: KnowledgeSearchResultItem[];
  meta?: Record<string, unknown>;
}

type ExecuteKnowledgeTool = (
  toolName: 'search_knowledge' | 'mcp_search_knowledge',
  params: Record<string, unknown>,
  context?: Record<string, unknown>,
) => Promise<{
  success: boolean;
  status?: number;
  data?: KnowledgeToolResult;
  error?: string;
}>;
```

### 6.3 支持的工具名

本轮只支持以下两个现有工具名：

- `search_knowledge`
- `mcp_search_knowledge`

这样可以完全复用仓库中现有的 `knowledge` 工具命名，不引入新口径。

### 6.4 参数口径

本轮参数设计采用“透传 + 轻校验”，不重做严格 schema。建议约定：

- **必需字段**
  - `query`
- **可选字段**
  - `topK`
  - `domain`
  - `roleIds`
  - `sessionId`
  - `userId`

这样既能对齐 `knowledge/README.MD` 中已有的四维隔离口径，也能避免本轮过早引入复杂 DTO。

## 7. 错误语义与 blocker 映射

### 7.1 基本原则

`knowledge adapter` 接通后，不应再使用 `adapter_unavailable`。该 blocker 只属于占位 adapter。

真实 `knowledge adapter` 的失败，应映射为真实执行失败语义。

### 7.2 映射规则

- **成功且 `items` 非空**
  - `success: true`
  - `data: { items: [...] }`
  - 不产生 blocker

- **成功但 `items` 为空**
  - `success: true`
  - `data: { items: [] }`
  - 由现有 runtime 归一为 `empty_result`

- **查询超时**
  - `success: false`
  - `blockerCode: 'tool_timeout'`

- **鉴权失败 / token 无效**
  - `success: false`
  - `blockerCode: 'authentication_failed'`

- **权限不足**
  - `success: false`
  - `blockerCode: 'permission_denied'`

- **工具名不支持 / 参数不合法 / 下游异常**
  - `success: false`
  - `blockerCode: 'tool_error'`

### 7.3 设计收益

这样可以保证：

- `build-conclusion.ts` 的文案不会误报为“尚未接通”
- `knowledge` 的失败路径可以和 `unify_query` 一样进入统一 blocker 语义
- 后续接 `k8s / ssh` 时，也能复用同样的 contract 思路

## 8. 与现有 runtime 的接线方式

### 8.1 最小改动点

本轮建议只做两类接线：

1. `v2/src/adapters/index.ts` 导出新的 `knowledge` adapter 工厂
2. `v2/src/runtime/execute-case.ts` 补齐 `search_knowledge` / `mcp_search_knowledge` 到 `knowledge` 的映射

### 8.2 不做的重构

本轮不引入：

- 多 adapter registry
- 按 `toolClass` 动态分发多个 adapter 的 runtime 改造
- `knowledge` 专属 evidence 类型
- `knowledge` 专属 conclusion 分支

原因是：当前已有 runtime 合同已经足够承接 `knowledge` 的真实执行结果，本轮优先目标是补能力，而不是重构结构。

## 9. 测试与验收策略

### 9.1 最低测试覆盖

建议至少补以下 4 类测试：

1. **adapter 成功路径**
   - `knowledge` 返回非空 `items`
   - 断言存在 `tool_result`
   - 断言无 blocker

2. **adapter 空结果路径**
   - `knowledge` 返回空 `items`
   - 断言 blocker 被归一成 `empty_result`
   - 断言结论不再出现“adapter 尚未接入”

3. **adapter 失败路径**
   - 覆盖 `tool_timeout / authentication_failed / permission_denied / tool_error`
   - 断言 blocker 与结论动作正确

4. **runtime 接线回归**
   - 在 `executeCase()` 中传入 `knowledge` 工具请求
   - 断言它会进入 `toolExecutions -> evidence -> conclusion`

### 9.2 验收标准

本设计落地后，至少应满足以下验收条件：

1. `knowledge` 工具不再走 `adapter_unavailable`
2. `selectedToolClasses` 包含 `knowledge` 的场景，可以拿到真实执行结果
3. 成功时能写入 `tool_result` evidence
4. 空结果时能归一成 `empty_result`
5. 失败时能归一成真实 blocker，而不是“尚未接通”
6. 现有 `unify_query / relation / collaborative_request` 回归不退化

### 9.3 本轮明确不作为验收项的内容

为避免 scope 扩散，本轮不要求：

- `k8s / ssh` 同步接通
- replay suite 全量迁移到 `knowledge` 新能力
- 知识检索质量优化到最终形态
- runtime 升级为多 adapter registry

## 10. 风险与后续演进

### 10.1 当前风险

- 真实知识检索执行器的现有接入口可能并不统一
- `search_knowledge` 与 `mcp_search_knowledge` 可能存在返回结构差异
- 若后续直接接更多 adapter，本轮的单 adapter 接法会面临再次抽象的需求

### 10.2 控制策略

- 本轮先通过内部执行函数抽象把执行细节与 adapter contract 解耦
- runtime 主流程不动，降低对现有回归面的扰动
- 错误语义统一落在现有 blocker contract 上，减少新分支

### 10.3 后续自然演进

本轮完成后，最自然的下一步是：

1. 复用同样 contract 模式接 `k8s` 或 `ssh`
2. 视接入数量决定是否引入 adapter registry
3. 再逐步把 `knowledge` 的参数 schema 与返回结果 contract 收紧为更稳定的长期接口

## 11. 最终结论

本设计的核心不是新增一个孤立工具，而是让 `knowledge` 正式成为 `V2 runtime` 中的真实执行能力：

- **规划层**继续由现有 `policy` 控制
- **执行层**通过新的 `knowledge adapter` 接通真实调用
- **归一层**继续复用现有 `RuntimeToolExecution / blocker / evidence / conclusion`
- **验证层**通过现有 regression / contract 测试体系验收

推荐的落地顺序是：

1. 先新增 `knowledge` adapter 与内部执行抽象
2. 再补 `toolName -> toolClass` 映射
3. 再补成功/空结果/失败路径测试
4. 最后确认 `knowledge` 已完全脱离 `adapter_unavailable` 语义

这样可以在不重写 runtime 的前提下，把 `knowledge` 从“可规划但不可执行”升级为“可规划且可执行”，并为后续 `k8s / ssh` 接入提供稳定样板。
