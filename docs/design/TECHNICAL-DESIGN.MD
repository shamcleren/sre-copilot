# SRE Copilot 技术架构设计

> ⚠️ **本文档中引用的 `v1/src/` 路径已于 2026-03-26 随 `v1/` 删除。** 当前主运行时为 `v2/`。

> 基于 OPAR 循环的自主 Agent 系统技术设计文档

## ⚠️ 文档说明

**本文档为技术架构设计，面向开发者和架构师。**

### 实现状态（2026-03-09 更新）

**基础设施**：
- ✅ **技术栈**: Node.js + TypeScript + Fastify
- ✅ **当前主运行时位置**: `v2/`（文中若出现 `v1/src/`，均属于历史设计快照）
- ✅ **当前示例端口口径**: `3001`
- ✅ **部署方式**: K8s + Docker
- ✅ **熔断机制**: LLM / MCP / 企微 API 已接入

**核心模块落地情况**：
| 模块 | 状态 | 说明 |
|------|------|------|
| OPAR 循环 | ✅ 已实现 | Observe→Plan→Act→Reflect，含状态机、死循环检测、Token 预算 |
| Observe 记忆注入 | ✅ 已修复 | 长期记忆（pgvector）注入 plan/act，工作记忆经 buildCompressedContext 注入 |
| 双系统理论 | ⚠️ 部分 | 复杂度评估已实现，System 1 快速通道仅有规则模式匹配，无 LLM 轻量分类 |
| Agent Team / Orchestrator | ✅ 已实现 | 四模式（single/competitive/collaborative/pipeline），AdminExpert 内置 |
| 工具系统 | ✅ 已实现 | 5 种 executor（builtin/mcp/skill/script/shell），注册表模式 |
| 记忆系统 | ✅ 已实现 | 三层（短期/工作/长期），pgvector 语义召回 |
| ChatOps | ⚠️ 已实现（受开关控制） | preview→confirm→execute→audit 闭环已落地；当前运行态受 `CHATOPS_ENABLED` 控制，默认以规则/正则主路径为主，LLM 用于辅助理解与兜底 |
| 任务调度 | ⚠️ 简化 | 内存调度器（cron/interval/event/once），无 Redis/Bull 持久化队列 |
| 可观测性 | ✅ 已实现 | Prometheus 指标、LLM/工具调用日志、Admin 面板 |
| 知识管理 | ✅ 已实现 | Git 知识源、多格式解析、学习闭环 |

**已知差距**（当前以 `TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD` 和 `CURRENT-IMPLEMENTATION-MAP.MD` 为有效基线）：
- ChatOps 仍缺独立的「问句 / 指令」一阶分类层与决策表文档
- 监控/知识/DevOps 专家 Agent 为 DynamicAgent，需 DB 配置才生效
- 熔断未覆盖 monitor API / embedding / skill 执行器
- 无集中错误码枚举

### 相关文档（设计入口）
- [项目概览](../../README.MD) - 快速了解项目定位
- [文档索引](../DOCS-INDEX.MD) - 全量文档目录 ⭐
- [协同规范](../../AGENTS.MD) - AI/自动化协作规则
- [排障自动化现状评估](./TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD) - 当前有效结论与冻结口径
- [当前实现地图](./CURRENT-IMPLEMENTATION-MAP.MD) - 主链路、入口差异与能力边界
- [排障自动化目标设计](./TROUBLESHOOTING-AUTOMATION-DESIGN.MD) - 后续演进目标
- [双系统设计](./DUAL-SYSTEM-DESIGN.MD) - 双系统理论完整设计
- [企微Bot指南](../wecom/WECOM-BOT-GUIDE.MD) - 使用和配置指南
- [部署规则](../.codebuddy/rules/) - 实际部署流程

### 当前有效口径（2026-03-09）

- 当前排障主验收入口是外部服务 `POST /api/chat`
- 当前验收标准以 `eval/corpus.json` 与 `docs/verification/VERIFICATION.MD` 为准
- 当前系统定位仍是“排障助手”，不是“已完成的排障 playbook 引擎”
- 本文档保留总体架构设计；涉及当前实现状态时，应同时参照评估结论与实现地图

---

## 1. 技术目标

### 1.1 核心特性

```
核心技术特性：
├── Agent Loop (OPAR循环) - 自主决策能力
├── 三层记忆系统 - 智能知识管理
├── 工具系统 - 可扩展能力边界
├── 任务调度器 - 主动执行能力
└── 多端协同 - 无缝用户体验
```

> 项目定位和核心理念请参考：[项目概览](../../README.MD)

### 1.2 历史定版决策快照（2026-02）

> 说明：以下为 2026-02 阶段的设计决策快照，保留用于理解当时架构取向。
> 涉及当前排障主入口、验收基线和项目定位时，请以本文前述“当前有效口径”和排障自动化相关文档为准。

- 产品定位：内部运维助手（上线标准 A：可用优先，允许人工兜底）
- 入口体验：企微 Bot 单入口，默认自动选 Agent，用户无需手动指定
- 执行模式：协同优先（主责 Agent + 协同 Agent），对用户保持单一回复
- 工具治理：多执行器统一治理（MCP/Skill/Script/Kubectl/Builtin）
- 变更策略：所有变更类动作前期统一 `advice-only`（仅返回命令，不自动执行）
- 管理方式：写操作走 AI 对话，控制台仅保留只读视图
- 管理流程：`preview -> 回复“确认” -> execute -> audit`
- 确认会话：5 分钟有效期，超时必须重新 preview
- 事务策略：默认全成功（all-or-nothing），失败自动回滚，v1 不开放 partial success
- 记忆策略：短期动态窗口、工作记忆槽位化、长期语义召回优先
- 测试策略：当前离线回归主入口为 `npm run v2:test` / `make verify-local-tests`；`make test-no-llm` 仅保留兼容占位

### 1.3 质量与可靠性约束（评审吸收）

- 覆盖率门槛（分层目标）：
  - 核心编排与规划模块（Orchestrator/Plan/Agent Loop）：`85%+`
  - 路由层（`routes/admin.ts`、`routes/mcp.ts`）与关键接入层（`services/wecom.ts`）：`60%+`
  - 基础设施层（`utils/database.ts`、协作总线）：`50%+`
- 可维护性约束：
  - `orchestrator/` 维持 `index` / `modes` / `analyzer` 分层，避免职责回流到单文件
  - 新增执行模式优先以独立模块接入，不再堆叠到单一入口文件
- 高可用约束：
  - 对 LLM、MCP、外部监控数据源调用统一增加熔断（Circuit Breaker）与限流（Rate Limit）
  - 熔断打开时返回可执行降级建议（尤其是 `advice-only` 场景）
- 错误模型约束：
  - 统一错误对象（错误码 + message + context），跨层保留可追踪上下文
  - 对外 API 返回遵循统一错误映射，避免各模块自由拼接错误文本

---

## 2. 核心架构

### 2.1 整体架构图（融合 Agent Team）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SRE Copilot Agent Team                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                      通信层 (Communication)                              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │  │
│  │  │   MCP    │  │  企微App │  │  Web UI  │  │  API     │                 │  │
│  │  │  Server  │  │  双向    │  │          │  │          │                 │  │
│  │  │ ⭐主要   │  │          │  │          │  │          │                 │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │  │
│  │       └──────────────┼──────────────┼──────────────┘                      │  │
│  └──────────────────────┼───────────────────────────────────────────────────┘  │
│                         │                                                      │
│  ┌──────────────────────▼──────────────────────────────────────────────────┐  │
│  │                   Orchestrator (智能协调者)                              │  │
│  │  任务分析 → 模式选择 → Agent 选择 → 协作编排 → 结果聚合                  │  │
│  └──────────────────────┬──────────────────────────────────────────────────┘  │
│                         │                                                      │
│        ┌────────────────┼──────────────────────┬────────────────────────┐      │
│        ▼                ▼                      ▼                        ▼      │
│  ┌────────────┐   ┌────────────┐        ┌────────────┐           ┌────────────┐ │
│  │ Agent Core │   │ Agent Core │        │ Agent Core │           │ Agent Core │ │
│  │ (监控专家) │   │ (知识专家) │        │ (DevOps)  │           │ (通用助手) │ │
│  └──────┬─────┘   └──────┬─────┘        └──────┬─────┘           └──────┬─────┘ │
│         │                │                     │                       │       │
│  ┌──────▼─────┐    ┌─────▼──────┐        ┌──────▼─────┐           ┌──────▼─────┐ │
│  │ OPAR Loop  │    │ OPAR Loop  │        │ OPAR Loop  │           │ OPAR Loop  │ │
│  │ + Memory   │    │ + Memory   │        │ + Memory   │           │ + Memory   │ │
│  │ + Tools    │    │ + Tools    │        │ + Tools    │           │ + Tools    │ │
│  └────────────┘    └────────────┘        └────────────┘           └────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    集成层 (Integrations)                               │  │
│  │  ┌──────────────────────────────┐  ┌──────────────────────────────┐   │  │
│  │  │      基础运维集成              │  │       Agent 能力扩展         │   │  │
│  │  │  ┌──────────┐  ┌──────────┐   │  │  ┌──────────┐  ┌──────────┐  │   │  │
│  │  │  │  K8s     │  │   Git    │   │  │  │   MCP    │  │  Skills  │  │   │  │
│  │  │  │ 部署运维 │  │ 版本协作 │   │  │  │ 工具桥接 │  │ 技能执行 │  │   │  │
│  │  │  └──────────┘  └──────────┘   │  │  └──────────┘  └──────────┘  │   │  │
│  │  │  ┌──────────┐                 │  │  ┌──────────┐               │   │  │
│  │  │  │  Shell   │                 │  │  │  Script  │               │   │  │
│  │  │  │ 命令执行 │                 │  │  │ 脚本执行 │               │   │  │
│  │  │  └──────────┘                 │  │  └──────────┘               │   │  │
│  │  └──────────────────────────────┘  └──────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    存储层 (Storage)                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │ 知识库源文件 │  │   Redis     │  │ PostgreSQL   │                 │  │
│  │  │ (Markdown)   │  │ 缓存/任务   │  │ 结构化数据  │                 │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                 │  │
│  │  ┌──────────────┐                                                      │  │
│  │  │  pgvector    │                                                      │  │
│  │  │ 语义检索索引 │                                                      │  │
│  │  └──────────────┘                                                      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

> 说明：Agent Team 中每个 Agent Core 为独立运行单元，具备各自的 OPAR 循环、记忆与工具视图；Orchestrator 负责调度与协作编排。

### 2.2 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| Web 框架 | Fastify | 高性能，TypeScript友好 |
| 任务队列 | 内存调度器（设计目标 Redis + Bull，当前未引入） | 轻量调度 |
| 存储 | PostgreSQL + 本地文件 | 结构化数据 + 知识文档 |
| LLM | BK AI (OpenAI 兼容网关) | 性能好，成本低 |
| 企微 | 自建应用 + Webhook | 官方推荐方案 |
| 监控 | 可插拔监控（默认占位） | 团队现有方案 |

---

## 3. 核心模块设计

### 3.1 Agent Loop（核心循环）

**路由与协作原则（定版）**：

- 默认自动路由：由系统自动选择主责 Agent，用户无须手动选 Agent
- 协同优先：跨域问题优先走多 Agent 协同（主责 + 协同），而非单纯串行调用
- 透明性：可在响应中附带“本次为自动协同分析”标记，不要求用户参与调度
- 兜底策略：主责 Agent 低置信度时自动升级协同或回退通用助手

```ts
// agent/loop.ts（设计草案，Node.js 实现）
export async function runAgentLoop(goal: string, context: Record<string, any> = {}) {
  const state = initState(goal, context);
  while (!state.done && withinLimits(state)) {
    const observations = await observe(state);
    const plan = await planStep(state, observations);
    const results = await act(state, plan);
    const reflection = await reflect(state, results);
    state.update({ observations, plan, results, reflection });
  }
  return state.output;
}
```

**状态机**：

```
                    ┌─────────┐
                    │  IDLE   │
                    └────┬────┘
                         │ receive task
                         ▼
                    ┌─────────┐
            ┌──────│OBSERVING│
            │       └────┬────┘
            │            │
            │            ▼
            │       ┌─────────┐
            │       │PLANNING │
            │       └────┬────┘
            │            │
            │            ▼
            │       ┌─────────┐
            │       │ ACTING  │
            │       └────┬────┘
            │            │
            │            ▼
            │       ┌─────────┐
    need    │       │REFLECTING
    more ───┘       └────┬────┘
    info            │    │
                    │    │ complete
                    │    ▼
                    │ ┌─────────┐
                    │ │COMPLETE │
                    │ └─────────┘
                    │    │
                    │    │ error
                    │    ▼
                    │ ┌─────────┐
                    └►│  ERROR  │
                      └─────────┘
```

### 3.2 工具系统

```ts
// services/tools/types.ts（设计草案）
export interface ToolSpec {
  name: string;
  kind: 'mcp' | 'skill' | 'script' | 'kubectl' | 'builtin';
  description: string;
  schema: Record<string, unknown>;
  mode: 'read-only' | 'advice-only';
  riskLevel: 'read' | 'write' | 'high-risk';
  timeoutMs?: number;
  auditPolicy: 'required' | 'optional';
}

// services/tools/gateway.ts（设计草案）
export async function executeViaGateway(
  spec: ToolSpec,
  params: Record<string, unknown>,
  context: { userId: string; roleIds: string[]; sessionId: string }
) {
  // 统一做权限、mode 限制、超时、审计
  // read-only: 可自动执行
  // advice-only: 仅返回命令建议（命令/风险/回滚）
}
```

**执行器分类（统一治理）**：

| Kind | 用途 | 默认模式 | 说明 |
|------|------|----------|------|
| `mcp` | 外部系统工具接入 | `read-only` | 主力工具来源，优先调用 |
| `skill` | 复用技能与工作流 | `read-only` | 标准化任务编排 |
| `script` | 受控脚本执行 | `advice-only` | 前期仅输出脚本建议，不自动执行变更 |
| `shell` | 系统命令执行（含 kubectl） | `advice-only` | 实际合并为 `shell` kind，含 K8s verb 白名单风控 |
| `builtin` | 平台基础能力 | `read-only` | 时间、知识检索等基础能力 |

**执行模式（当前阶段）**：

| 模式 | 是否自动执行 | 适用场景 |
|------|--------------|----------|
| `read-only` | 是 | 查询、检索、状态读取 |
| `advice-only` | 否 | 所有变更类动作（发布、重启、扩缩容、配置变更、密钥变更等） |

**统一工具元数据（ToolSpec）**：

```ts
type ToolSpec = {
  name: string;
  kind: 'mcp' | 'skill' | 'script' | 'kubectl' | 'builtin';
  description: string;
  schema: Record<string, unknown>;
  mode: 'read-only' | 'advice-only';
  riskLevel: 'read' | 'write' | 'high-risk';
  timeoutMs?: number;
  auditPolicy: 'required' | 'optional';
};
```

**统一超时治理（P3 收口）**：

- 执行器超时默认按 `riskLevel` 统一：`read=8s`、`write=15s`、`high-risk=30s`。
- 可通过环境变量覆盖：
  - `TOOLS_EXEC_TIMEOUT_READ_MS`
  - `TOOLS_EXEC_TIMEOUT_WRITE_MS`
  - `TOOLS_EXEC_TIMEOUT_HIGH_RISK_MS`
- 审计元数据必须记录最终生效的 `riskLevel/timeoutMs`，用于回放与排障。
- 各执行器可保留专项覆盖变量（如 `TOOLS_KUBECTL_TIMEOUT_MS`、`TOOLS_SCRIPT_TIMEOUT_MS`），但缺省回退到统一策略。

**对话返回规范（关键）**：

- `read-only` 工具：返回执行结果、数据来源、耗时、下一步建议
- `read-only` 工具失败：必须追加手工排查命令建议
- `advice-only` 工具：返回可执行命令清单，不直接执行，包含风险提示与回滚建议

示例（advice-only）：

```text
检测到该操作属于变更类（advice-only），我不会自动执行。

建议命令：
1) kubectl -n prod rollout restart deploy/api
2) kubectl -n prod rollout status deploy/api --timeout=120s

风险提示：
- 可能触发短时抖动，请在低峰期操作。

回滚建议：
- kubectl -n prod rollout undo deploy/api
```

**管理写操作流程（ChatOps Admin）**：

`preview -> 用户回复“确认” -> execute -> audit`

控制台仅保留只读视图（状态/审计/健康），写操作统一走 AI 对话。

### 3.2.2 AI 友好管理模式（定版）

管理能力默认以 AI 对话为主入口，而不是控制台点击配置。

**目标**：

- 管理动作对话化：自然语言 -> 结构化动作 -> 可审计执行
- 降低门槛：统一交互入口，减少多页面配置成本
- 强约束：所有写操作必须经过 preview 与确认

**交互约束**：

1. 用户输入管理意图（例如“给某角色绑定某工具”）
2. 系统生成结构化 `AdminAction[]` 与变更预览
3. 用户回复“确认”后执行
4. 返回执行结果与审计 ID

**执行约束**：

- 控制台仅保留只读能力（状态查看、审计查询、计划预览）
- 写操作仅通过对话入口触发
- 高风险动作在 v1 阶段默认 `advice-only`，只返回命令建议

**输出规范**：

- `read-only` 失败：必须包含手工排查命令建议
- `advice-only` 输出固定三段：`命令` / `风险` / `回滚`

**AdminAction 当前集合（持续扩展）**：

1. `tool.register` / `tool.update` / `tool.delete` / `tool.disable`
2. `role.bind` / `role.unbind` / `role.upsert`
3. `user.assign-role` / `user.remove-role` / `user.business-context.set`
4. `mcp.server.register` / `mcp.server.update`
5. `token.rotate` / `token.revoke`
6. `execution.mode.switch`
7. `model.runtime.update` / `model.default.set` / `model.auto-routing.set`
8. `agent.profile.upsert` / `agent.registry.upsert` / `agent.registry.delete`

**确认会话与事务策略（定版）**：

- 确认会话有效期：5 分钟（超时后需重新 preview）
- 多动作执行策略：默认全成功（all-or-nothing）
- 若任一动作失败：整体标记失败并执行回滚
- `partial success`：v1 不开放

### 3.2.3 ChatOps 全量管理 API 对话映射（定版）

#### 目标

- 用户可通过自然语言触达全部管理能力，避免“只支持固定命令模板”的僵化体验。
- 查询类能力直接返回结果；变更类能力统一进入 `preview -> confirm -> execute -> audit`。
- API / Web ChatOps / 企微入口遵循同一语义契约，保证同意图同结果（或差异可解释）。

#### 读写分流规则

- **查询类（read）**：直接返回结构化文本结果，不生成动作数组。
  - 示例：工具列表、角色列表、用户列表、MCP 列表、审计、日志统计、模型配置、Token 用量趋势。
  - 性能约束：查询类默认使用“有界外部发现”（如 MCP 工具自动发现带超时），超时时允许降级为本地已配置视图，避免阻塞对话主链路。
- **变更类（write/high-risk）**：必须先生成 `AdminAction[]`，再进入确认会话执行。
  - 示例：角色变更、用户授权、MCP 注册、Token 吊销、模型默认值切换、自动路由开关。

#### 管理域覆盖矩阵（与 `routes/admin.ts` 对齐）

- **Role 域**：角色列表、角色工具查询、角色创建/更新、角色工具绑定/解绑。
- **User 域**：用户列表、用户角色查询/分配/移除、默认业务上下文查询/设置、用户工具配置查询/更新/删除。
- **MCP 域**：服务列表与注册/更新。
- **Token 域**：用户 token 列表、轮换、吊销、统计概览/趋势/最近记录。
- **Action 域**：preview、confirm、audit、chatops parse/execute。
- **Scenario / Memory / Quality 域**：场景库、记忆证据、会话质量评估。
- **Model 域**：模型列表、运行时配置、默认模型、自动路由、过滤查询。
- **Log 域**：LLM 调用日志（统计/列表/详情）、工具调用日志（统计/列表/详情）。
- **Agent 域**：画像与注册表查询/更新。

#### 失败诊断与可执行建议

- 对“为什么失败/失败原因”意图，优先读取最近失败审计记录并返回：
  - 失败动作
  - 失败原因
  - 下一步修复建议（按动作类型推断）
- 外部依赖异常（超时/熔断/鉴权/5xx）统一返回降级建议，避免仅返回裸错误。

#### 会话续接机制（ChatOps 页面）

- 新增只读接口：`GET /api/admin/actions/pending-session`（按当前用户返回最近 pending 会话）。
- 页面刷新后优先调用该接口恢复会话标识，避免依赖前端从审计列表推断 pending 状态。
- 恢复成功后继续沿用 `preview -> confirm -> execute -> audit`，不改变执行安全策略。

#### 防遗漏机制（新增能力必须同步）

新增任意管理 API 或动作类型时，必须同时完成以下三项：

1. **语义映射补齐**：在 ChatOps 解析层补充自然语言触发规则（查询或变更）。
2. **回归用例补齐**：在 `chatops-parser` 与相关服务测试中增加对应场景。
3. **文档矩阵补齐**：同步更新本节“管理域覆盖矩阵”与验收报告。

若任一项缺失，则视为设计未闭环，不得标记能力完成。

工程化守门（本地验收）：

- `scripts/test/check-chatops-coverage.sh`
  - 监听 `routes/admin.ts`、`chatops-parser.ts`、`admin-action-manager.ts` 的变更
  - 若命中变更，强制要求同步修改设计文档与对应回归测试
- 守门已接入 `make verify-local`（`quick` 模式除外）

### 3.2.1 记忆策略（定版）

记忆系统采用“短期 + 工作 + 长期”三层，但不再使用固定条数拼接。

| 层级 | 当前定版策略 | 关键约束 |
|------|--------------|----------|
| 短期记忆 | `conversations` 表 JSONB + 动态 token 窗口 | 主循环 `buildCompressedContext`（≤6 轮 + token 预算）；Observe 路径 `buildSemanticMemoryContext`（≤12 条 + 900 tokens 预算截断） |
| 工作记忆 | 槽位化结构（目标/约束/已执行/失败原因/待确认）+ 会话摘要 | 每轮 OPAR 可读写，支持冲突覆盖；会话摘要存于 `session_contexts` 表 |
| 长期记忆 | 语义召回优先（embedding + 重排），全文检索兜底 | 权限过滤后再重排；存储在 `memories` 表（type='long_term'） |

> **实现说明**：短期记忆数据来源于 `conversations` 表（`messages` JSONB），由 `conversation-manager.ts → getRecentConversationMessages()` 读取。`memories` 表的 `short_term` 类型当前未使用。会话摘要归属于工作记忆层（`session_contexts`），不在短期记忆中。

短期记忆注入顺序（`buildCompressedContext`）：
1. 工作记忆摘要（如有）
2. 近期对话历史（按轮数和 token 预算截断）
3. 当前用户输入

工作记忆推荐结构：

```ts
type WorkingMemory = {
  goal: string;
  constraints: string[];
  executedSteps: string[];
  failures: string[];
  pendingConfirmations: string[];
};
```

### 3.3 任务调度器

```ts
// scheduler/index.ts（设计草案）
class TaskScheduler {
  private queue: Task[] = [];
  private scheduled: ScheduledTask[] = [];
  private running = false;

  async start() {
    this.running = true;
    this.tickLoop();
  }

  schedule(task: Task, trigger: Trigger, name?: string) {
    this.scheduled.push({ name, task, trigger });
  }

  async submit(task: Task) {
    this.queue.push(task);
  }

  private async tickLoop() {
    while (this.running) {
      const task = this.queue.shift();
      if (!task) { await sleep(200); continue; }
      await this.execute(task);
    }
  }

  private async execute(task: Task) {
    // 执行任务 + 失败重试/告警钩子（略）
  }
}
```

**触发器类型**：

触发器示例：
- **CronTrigger**: `0 9 * * *`（每天 9 点）
- **IntervalTrigger**: 每 5 分钟
- **EventTrigger**: 告警事件触发（如 `alert.received`）
- **ConditionTrigger**: 条件触发（如 CPU > 80%）

### 3.4 企业微信集成架构

**技术方案：企业微信自建应用**

```
┌─────────────────────────────────────────────────────────────────┐
│                     企业微信双向通信架构                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   企业微信群                    SRE Copilot                    │
│   ┌─────────┐                  ┌─────────────┐                  │
│   │  用户   │                  │   Agent     │                  │
│   │ @Bot    │                  │             │                  │
│   └────┬────┘                  └──────┬──────┘                  │
│        │                              │                          │
│        │  1. 发送消息                 │                          │
│        │     (@机器人)                │                          │
│        ▼                              │                          │
│   ┌─────────┐                         │                          │
│   │企微服务器│                         │                          │
│   └────┬────┘                         │                          │
│        │                              │                          │
│        │  2. 回调推送                 │                          │
│        │     POST /wechat/callback    │                          │
│        ▼                              │                          │
│   ┌─────────────────────────────────────┐                       │
│   │           Webhook Handler           │                       │
│   │  - 验证签名                         │                       │
│   │  - 解析消息                         │                       │
│   │  - 触发 Agent                       │                       │
│   └─────────────────┬───────────────────┘                       │
│                     │                                            │
│                     │  3. Agent 处理                             │
│                     ▼                                            │
│              ┌─────────────┐                                     │
│              │ Agent Loop  │                                     │
│              │  - 理解意图  │                                     │
│              │  - 检索知识  │                                     │
│              │  - 生成回复  │                                     │
│              └──────┬──────┘                                     │
│                     │                                            │
│                     │  4. 发送回复                               │
│                     │     POST webhook                           │
│                     ▼                                            │
│              ┌─────────────┐                                     │
│              │  企微群     │                                     │
│              │  收到回复   │                                     │
│              └─────────────┘                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**配置要求**：

```yaml
# 企业微信后台配置
应用类型: 自建应用
回调URL: https://your-domain.com/wechat/callback
Token: <自定义>
EncodingAESKey: <自动生成>

# 群机器人
Webhook URL: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
```

> 详细配置步骤请参考：[企微Bot使用指南](../wecom/WECOM-BOT-GUIDE.MD)

### 3.5 可观测与监控集成（可选）

可观测与监控集成为可插拔能力：
- 支持接入外部监控系统（如 Prometheus/Grafana/其他）
- 提供告警接收、指标查询、事件归因的统一接口
- 与 Agent Team 协作：自动分析 + 输出建议

**告警处理流程（通用）**：

```
告警触发
    │
    ▼
┌─────────────┐
│ 接收告警    │ ← Webhook 或定时拉取
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 告警分类    │ ← 根据告警名称、级别分类
└──────┬──────┘
       │
       ├─── P0/P1 紧急 ──→ 立即通知 + 自动分析
       │
       ├─── P2 重要 ──→ 自动分析 + 汇总通知
       │
       └─── P3/P4 ──→ 记录 + 定时汇总
              │
              ▼
       ┌─────────────┐
       │ Agent 分析  │
       │ - 检索历史  │
       │ - 关联分析  │
       │ - 生成建议  │
       └──────┬──────┘
              │
              ▼
       ┌─────────────┐
       │ 推送通知    │
       │ - 告警摘要  │
       │ - 可能原因  │
       │ - 建议措施  │
       │ - 相关文档  │
       └──────┬──────┘
              │
              ▼
           用户/群聊
```

---

## 4. 数据流设计

### 4.1 消息处理流程

```
用户消息
    │
    ▼
┌─────────────────┐
│ 消息接收        │
│ - 企微回调      │
│ - API 请求      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 消息预处理      │
│ - 解析内容      │
│ - 提取上下文    │
│ - 识别用户      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 意图识别        │
│ - 告警处理      │
│ - 知识查询      │
│ - 排障咨询      │
│ - 经验分享      │
│ - 任务指令      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Agent 处理      │
│ - 加载上下文    │
│ - 检索知识      │
│ - 思考推理      │
│ - 调用工具      │
│ - 生成回复      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 响应发送        │
│ - 格式化        │
│ - 发送通知      │
│ - 更新状态      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 后处理          │
│ - 更新记忆      │
│ - 检查沉淀      │
│ - 记录日志      │
└─────────────────┘
```

### 4.2 任务执行流程

```
任务创建
    │
    ├─── 即时任务 ──→ 直接入队
    │
    └─── 定时任务 ──→ 调度器管理
              │
              ▼
         ┌─────────────┐
         │ 任务队列    │
         └──────┬──────┘
                │
                ▼
         ┌─────────────┐
         │ 任务执行    │
         │ - Agent Loop│
         └──────┬──────┘
                │
         ┌──────┴──────┐
         │             │
    成功 ▼        失败 ▼
┌─────────────┐  ┌─────────────┐
│ 完成通知    │  │ 重试/告警   │
└─────────────┘  └─────────────┘
```

---

## 5. 接口设计

### 5.1 Agent API

```yaml
# POST /api/agent/chat
# 与 Agent 对话
Request:
  message: string       # 用户消息
  session_id: string?   # 会话 ID
  context: object?      # 额外上下文

Response:
  response: string      # Agent 回复
  thinking: string?     # 思考过程（调试用）
  tools_used: array     # 使用的工具
  references: array     # 参考文档
  suggestions: array?   # 后续建议

# POST /api/agent/task
# 提交任务
Request:
  goal: string          # 任务目标
  context: object?      # 上下文
  priority: string      # 优先级
  notify: boolean       # 是否通知

Response:
  task_id: string
  status: string
  estimated_time: string?

# GET /api/agent/task/{task_id}
# 查询任务状态
Response:
  task_id: string
  status: string        # pending/running/complete/failed
  progress: number
  result: object?
  logs: array
```

### 5.2 工具 API

```yaml
# GET /api/tools
# 获取可用工具列表
Response:
  tools:
    - name: string
      description: string
      schema: object
      permissions: array

# POST /api/tools/{tool_name}/execute
# 执行工具（调试用）
Request:
  params: object

Response:
  success: boolean
  result: any
  error: string?
```

### 5.3 调度 API

```yaml
# GET /api/scheduler/tasks
# 获取定时任务列表
Response:
  tasks:
    - name: string
      trigger: object
      last_run: string
      next_run: string
      status: string

# POST /api/scheduler/tasks
# 创建定时任务
Request:
  name: string
  task_type: string
  trigger: object
  params: object

# DELETE /api/scheduler/tasks/{task_name}
# 删除定时任务
```

---

## 6. 实现路线图

> 说明：本章节中的 `Phase` 拆分用于架构演进说明（历史规划视角）。
> 当前实际执行优先级与验收门禁以 `docs/verification/ITERATION-PLAN.MD` 和根目录待办清单文件为准。
> 若出现冲突，以 Iteration 计划为准。

### Phase 1: Agent Loop 核心 ✅

**目标**：实现 OPAR 循环的基础框架

**技术任务**：
- [x] Agent 状态机设计 — `agent/safety.ts`
- [x] OPAR 循环实现 — `agent/loop.ts`
- [x] 规划器 (Planner) — `agent/plan.ts`（双系统 + LLM 工具规划）
- [x] 执行器 (Executor) — `agent/act.ts` + `services/tools/executors/`
- [x] 反思器 (Reflector) — `agent/reflect.ts`
- [x] 安全检查机制 — 状态转换校验 / 死循环检测 / Token 预算

### Phase 2: 工具系统扩展 ✅

**目标**：丰富 Agent 的能力边界

**技术任务**：
- [x] 工具注册中心 — `services/tools/registry.ts`
- [x] 权限控制系统 — `services/role-manager.ts` + RBAC
- [x] 监控工具集成 — MCP 桥接蓝鲸监控
- [x] 命令执行工具 — `shell` executor + K8s management
- [x] 知识管理工具 — Git 知识源 + 多格式解析 + 语义检索

### Phase 3: 任务调度系统 ⚠️ 简化实现

**目标**：让 Agent 具备主动执行能力

**技术任务**：
- [x] 任务队列设计 — 内存队列（非 Redis/Bull）
- [x] 多种触发器实现 — cron / interval / event / once
- [ ] 任务执行监控 — 无 UI 面板
- [ ] 持久化队列 — 未引入 Redis/Bull

**实际交付**：轻量内存调度器，支持 Git 同步、学习闭环等定时任务。

### Phase 4: 可观测系统集成 ✅

**目标**：接入外部可观测系统，实现告警自动处理与分析。

**技术任务**：
- [x] 可观测平台接入 — MCP 桥接蓝鲸监控 / Prometheus 指标
- [x] 指标查询分析 — PromQL 查询 / 范围查询
- [ ] 告警接收处理 — 无 Webhook 告警接收
- [ ] 自动化响应 — 无自动化告警响应

---

## 7. 技术参考

### 相关文档（补充）
- [项目概览](../../README.MD) - 了解项目定位和快速开始
- [企微Bot指南](../wecom/WECOM-BOT-GUIDE.MD) - 企微Bot配置和使用
- [部署规则](../.codebuddy/rules/) - 实际部署流程和最佳实践

### 外部资源
- [企业微信开发文档](https://developer.work.weixin.qq.com/)
- [Fastify 官方文档](https://www.fastify.io/)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)

---

*文档版本: 2.0*  
*更新时间: 2026-02-25*  
*作者: SRE Copilot Team*

---

## 8. Agent Team 设计

### Agent Team 设计摘要（精简版）

> 单入口（企微/API/MCP）下，通过 Orchestrator 进行多 Agent 选择与协作，目标是“更专业、更可控、更可扩展”。

#### 核心原则

- 独立自治：每个 Agent 聚焦领域职责，可单独完成任务。
- 按需竞争：任务归属不明确时先评估匹配度，再选最优 Agent。
- 协作补位：主执行 Agent 信心不足时触发并行协作，统一聚合结果。
- 统一治理：权限、风险、审计、超时、错误模型保持一致。

#### 架构分层

- 入口层：企业微信 / API / MCP / Web ChatOps。
- 协调层：`Orchestrator` 负责任务分析、模式选择、结果聚合。
- 执行层：监控/知识/通用/DevOps/**管理专家** 等专业 Agent。
- 共享能力层：记忆系统、知识检索、工具系统。

#### 管理专家 Agent（AdminExpert）

ChatOps 不再是独立于 Agent 的 API 映射层，而是作为**管理专家 Agent** 融入 OPAR 编排框架：

```
ChatOps 入口（Web / 企微 / API）
       │
       ▼
   Orchestrator ─── evaluate() 路由 ──→ AdminExpert Agent
       │
       ├─ Observe: buildSemanticMemoryContext（900 tokens / 5 long-term / skipRoles=false）
       ├─ Plan:    parseChatOpsInput（规则引擎 + LLM，复用现有全部解析能力）
       ├─ Act:     preview → confirm → execute → audit（完整管理闭环）
       └─ Reflect: 执行后自评 + 对话记忆沉淀
```

**设计要点**：
- 与知识专家、监控专家使用同一套记忆系统和 OPAR 循环
- `parseChatOpsInput` 从独立管道降为 Plan 阶段的规则引擎
- 记忆参数对齐专家会话（900 token 历史窗口、5 条长期记忆、含角色信息）
- 执行后 Reflect 阶段写入对话记忆，支持跨轮次上下文理解
- 路由 fallback：Agent 未就绪时退化为原始管道，保证兼容性

#### 执行模式（定版）

- `single`：简单问题，单 Agent 低成本快速响应。
- `competitive`：候选 Agent 评分竞争后选优执行。
- `collaborative`：多 Agent 并行补充，主 Agent 汇总输出。
- `sequential`：多步骤任务按流水线传递上下文。

#### 相关文档

- [双系统设计](./DUAL-SYSTEM-DESIGN.MD)
- [文档索引](../DOCS-INDEX.MD)
- [协同规范](../../AGENTS.MD)

---

### 🤖 Agent 设计规范

#### Agent 接口标准

每个 Agent 必须实现以下接口：

```typescript
interface DomainAgent {
  // ===== 身份信息 =====
  id: string;                    // 唯一标识
  name: string;                  // 展示名称
  emoji: string;                 // 图标
  description: string;           // 角色描述
  version: string;               // 版本号
  
  // ===== 核心能力 =====
  
  /**
   * 独立执行任务
   * @returns 包含结果、信心度、协作信号
   */
  execute(task: AgentTask, context: AgentContext): Promise<AgentResponse>;
  
  /**
   * 评估任务匹配度（竞争模式）
   * @returns 0-1 的匹配分数
   */
  evaluate(task: AgentTask, context: AgentContext): Promise<number>;
  
  /**
   * 接收协作请求
   * @returns 协作结果
   */
  collaborate(request: CollaborationRequest): Promise<CollaborationResponse>;
  
  // ===== 配置 =====
  config: AgentConfig;           // Agent 配置
  
  // ===== 生命周期 =====
  initialize(): Promise<void>;   // 初始化
  shutdown(): Promise<void>;     // 清理
}
```

#### Agent 配置结构

```typescript
interface AgentConfig {
  // 知识体系
  knowledge: {
    searchDomains: string[];     // Knot 检索域
    vectorStoreIds?: string[];   // 向量数据库
    contextWindow: number;       // 上下文窗口
  };
  
  // 工具权限
  tools: {
    owned: string[];             // 专属工具
    shared: string[];            // 共享工具
    forbidden: string[];         // 禁用工具
  };
  
  // LLM 配置
  llm: {
    model: string;               // 模型选择
    temperature: number;         // 创造性
    systemPrompt: string;        // 系统提示词
    fewShotExamples?: Example[]; // 示例
  };
  
  // 协作配置
  collaboration: {
    canLead: boolean;            // 是否可主导
    canDelegate: string[];       // 可委托的 Agent
    canConsult: string[];        // 可咨询的 Agent
    maxCollaborations: number;   // 最大协作次数
  };
  
  // 性能配置
  performance: {
    maxExecutionTime: number;    // 最大执行时间
    maxTokens: number;           // Token 限制
    cacheEnabled: boolean;       // 缓存开关
  };
  
  // 能力标签
  capabilities: string[];        // 能力标签列表
}
```

---

### 🔄 执行模式

#### 模式 1: 单 Agent 模式 (Single)

**适用场景**：简单、明确的问题

```
用户："最近有什么告警？"
  ↓
Orchestrator 快速分析
  ↓
直接指派给 监控专家 Agent
  ↓
监控专家独立完成
  ↓
返回结果
```

**特点**：
- ⚡ 快速响应（System 1）
- 🎯 精准匹配
- 💰 成本最低

#### 模式 2: 竞争模式 (Competitive)

**适用场景**：不确定哪个 Agent 最合适

```
用户："服务性能很慢，帮我看看"
  ↓
Orchestrator 召集候选 Agent
  ↓
┌─────────────┬─────────────┬─────────────┐
│监控专家     │DevOps专家   │通用助手     │
│评分: 0.85   │评分: 0.75   │评分: 0.40   │
└─────────────┴─────────────┴─────────────┘
  ↓
监控专家胜出 → 执行任务
  ↓
(如果信心度低 → 转协作模式)
```

**特点**：
- 🏆 优胜劣汰
- 🎯 自动选择最佳
- 🔄 可转协作模式

#### 模式 3: 协作模式 (Collaborative)

**适用场景**：复杂问题，需要多角度分析

```
用户："分析昨天的故障"
  ↓
Orchestrator 启动协作
  ↓
1️⃣ 监控专家（主导）：分析指标
2️⃣ DevOps专家（协作）：代码分析
3️⃣ 知识专家（协作）：查找文档
  ↓
并行执行 → 结果聚合
  ↓
监控专家整合最终回答
```

**特点**：
- 🤝 多角度分析
- 💡 综合方案
- 📊 完整视图

#### 模式 4: 流水线模式 (Sequential)

**适用场景**：多步骤任务

```
用户："生成昨天的告警报告"
  ↓
Orchestrator 构建流水线
  ↓
Step 1: 监控专家 → 查询告警
  ↓
Step 2: 监控专家 → 分析模式
  ↓
Step 3: 知识专家 → 生成报告
  ↓
Step 4: 通用助手 → 发送报告
```

**特点**：
- 📝 步骤清晰
- 🔄 上下文传递
- ✅ 可中断恢复

---

### 🧠 智能协调机制

#### Orchestrator 职责边界

- 任务分析：识别意图、复杂度、风险等级与可执行性。
- 模式选择：在 `single/competitive/collaborative/sequential` 中选择执行模式。
- 角色路由：基于能力匹配、权限边界与上下文选择主执行 Agent。
- 协作编排：在需要时触发协作，控制并发、超时与回退。
- 结果聚合：统一输出结构，补充信心度与来源元信息。

#### 运行时约束

- 先权限后执行：工具选择必须通过角色权限过滤。
- 先可验证后输出：关键结论需可追溯到工具结果或知识来源。
- 失败可降级：协作超时或子任务失败时，返回可执行降级建议，不静默失败。

---

### 📊 预定义 Agent 角色

| 角色 | 主要职责 | 典型场景 | 协作关系 |
|------|----------|----------|----------|
| 监控专家 | 指标分析、告警定位、性能诊断 | 告警分析、性能抖动、SLO 排查 | 可主导，可咨询 DevOps/知识专家 |
| 知识专家 | 文档检索、知识整合、经验沉淀 | 最佳实践检索、历史案例复用 | 可主导，可咨询监控/DevOps专家 |
| 通用助手 | 兜底问答、任务分发、用户引导 | 泛问答、跨域协同入口 | 默认兜底，可路由至专业角色 |
| DevOps 专家（可选） | 部署排障、配置审查、运维操作建议 | 发布异常、配置错误、运行故障 | 按需参与，不默认常驻 |

> 角色详细配置（模型参数、工具白名单、协作阈值）以运行时配置与测试用例为准，不在设计主文档中重复维护。

---

### 💬 用户体验设计

#### 输出规范（摘要）

- 角色透明：输出明确标注主导角色和协作角色。
- 结构稳定：结论、证据、建议、下一步四段式输出。
- 建议可执行：建议必须可落地，避免泛化措辞。
- 支持续接：在多轮对话中保留上下文并给出后续引导。

---

### 🔧 技术实现要点

- Agent 注册中心：支持角色注册、能力查询与运行时选择。
- 协作事件总线：支持协作请求分发、状态通知与失败回调。
- 快速匹配：基于关键词/能力标签进行首轮候选筛选。
- 信心度评估：综合工具结果、知识来源与响应质量给出置信分。
- 超时与回退：协作任务必须有超时策略和降级结果。

> 具体实现代码请以当前仓库中的 `v2/` 与现行脚本/文档为准；文中保留的 `v1/src/` 路径仅用于历史设计快照，不再指向可用源码。

---

### 📈 扩展性设计

#### 新增 Agent 最小流程

1. 定义角色契约（能力、工具权限、协作边界、风险等级）。
2. 完成注册与路由映射（能力标签 + 快速匹配规则）。
3. 补齐验证（单测、集成、场景回放）。
4. 纳入文档与验收（根目录待办清单文件 / `ITERATION-PLAN.MD` / `VERIFICATION.MD`）。

---

### 🎯 设计优势总结

#### 1. 专业化深度
- ✅ 每个 Agent 专注于特定领域
- ✅ 独立的知识库和工具集
- ✅ 针对性的提示词和示例
- ✅ 更准确的专业回答

#### 2. 灵活性
- ✅ 动态选择最合适的 Agent
- ✅ 支持多种执行模式
- ✅ 按需协作，按需扩展
- ✅ 轻松添加新角色

#### 3. 可维护性
- ✅ 标准化接口，易于理解
- ✅ 模块化设计，职责清晰
- ✅ 独立测试，易于调试
- ✅ 配置驱动，易于调整

#### 4. 用户体验
- ✅ 角色透明，知道谁在帮忙
- ✅ 专业回答，质量更高
- ✅ 智能推荐，引导明确
- ✅ 无缝切换，体验流畅

#### 5. 可扩展性
- ✅ 新增 Agent 只需实现接口
- ✅ 不影响现有 Agent
- ✅ 协作关系灵活配置
- ✅ 支持渐进式演进

---

### 🚀 历史附录说明

> 本节以下原包含早期 Agent Team 的周计划、FAQ 与参考清单。
> 为避免与当前 `Iteration 0~3` 执行计划冲突，历史实施节已移除；
> 如需查看当前执行计划，请优先使用：
> - `docs/verification/ITERATION-PLAN.MD`
> - 根目录待办清单文件
> - `docs/roadmap/ROADMAP.MD`
