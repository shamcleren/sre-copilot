# 当前实现地图（2026-03-10）

> ⚠️ **本文档描述的是 `v1/` 时代的实现现状，`v1/` 已于 2026-03-26 删除。** 当前主运行时为 `v2/`。

> 目的：把当前代码里的真实主链路、入口差异、能力边界和主要缺口固定下来。
> 本文档描述的是“现在实际上怎么跑”，不是目标设计。目标设计见 `TROUBLESHOOTING-AUTOMATION-DESIGN.MD`。

## 1. 历史主链路

在 `v1/` 时代，排障主验收链路曾固定为：

`旧 CLI -> /api/chat -> semantic intent -> runAgentLoop -> observe / plan / act / reflect -> reply`

它当时被视为基线，是因为：

- 评估脚本当时通过 CLI 调 `/api/chat`
- 这条链路最容易持续回归
- 当时排障自动化能力的主要缺口，也都暴露在这条链路上

## 2. 主入口对照

### 2.1 Chat / CLI

- 历史入口：`v1/bin/srectl.js`、Web Chat 页面
- API：`v1/src/routes/chat.ts`
- 特征：
  - 先做语义意图识别
  - 当前使用启发式识别，`enableLlm: false`
  - 之后直接进入 `runAgentLoop`
  - 不经过 Orchestrator 的多专家编排主路径

### 2.2 企微 Agent 集成

- 入口：企微消息与集成服务
- 主要实现：`v1/src/services/agent-integration.ts`
- 特征：
  - 这里会走 Orchestrator / Agent Team 相关逻辑
  - 和 `/api/chat` 的决策、协作和输出路径并不一致

### 2.3 ChatOps / Admin

- 入口：管理台、受控 ChatOps 页面
- 主要实现：`v1/src/routes/admin.ts`、ChatOps 相关解析链路
- 特征：
  - 偏治理、权限、受控执行
  - 不是当前排障评估主链路

## 3. 当前实现拆解

### 3.1 意图层

当前实现：

- 代码：`v1/src/services/semantic-intent-engine.ts`
- 能力：
  - 区分 `question / troubleshoot / execute`
  - 给出 `scenario / playbookId / conclusionSchema / needClarification / evidenceItems / suggestedStepCount / troubleshootingProfile`
  - 当前主线验收语料 `eval/corpus.json` 的 15 个 case 都已有显式场景映射

当前限制：

- 仍以启发式 matcher 为主，不是完整语义分类器
- `needClarification` 已能进入部分 step 规划，但还不是完整 typed clarification contract
- 场景数据已开始外置到 `v1/src/services/troubleshooting-playbooks.json`，且 `troubleshooting-scenario-loader.ts` / `troubleshooting-scenario-matcher.ts` 已把文件加载、结构校验、模板实例化与启发式匹配从 `troubleshooting-scenarios.ts` 中拆出；但整体仍属于“文件化 playbook + 代码 matcher”过渡态

### 3.2 规划与执行层

当前实现：

- 代码：`v1/src/agent/loop.ts`
- 关键模块：
  - `observe.ts`
  - `plan.ts`
  - `act.ts`
  - `reflect.ts`

当前能力：

- 可以做多步循环
- 可以携带会话上下文和部分工具结果
- 已开始把 playbook 进度写入工作记忆，供后续轮次继续消费
- 首批 `request_evidence` step 已开始携带文件化 `evidenceMatchers`
- tool-first playbook 已开始携带 step 级 `toolBindings`，当前 step 可显式声明候选工具、参数与回退顺序
- 场景实例化已开始从首个 `tool` step 自动推导兼容 `toolRouting`，tool-first 场景对 profile 级重复工具配置的依赖继续下降
- planner 与 `/api/chat` metadata 已开始共用 `getScenarioToolRouting`，工具路由回退逻辑开始从多处内联判断收口到共享 helper
- 当前文件化 playbook 中的 tool-first 场景已去掉 `allowedToolNames` 旧字段，工具候选清单统一回到 `toolBindings`
- 运行时实例化已开始把 legacy `allowedToolNames + toolParams` 自动归一成 `toolBindings`，planner 和工具路由推导优先消费归一化后的 step
- `summarizePlaybook` 对外已不再暴露 `allowedToolNames`，`/api/chat` metadata 中的 playbook 摘要开始统一只回传归一化后的 `toolBindings`
- `/api/chat` metadata 的 `toolRouting` 已开始附带 `toolRoutingSource`，可区分当前工具路由来自当前 step、playbook step 还是 profile 兼容字段
- `/api/chat` metadata 的 `intentDecision` 已开始附带 `toolPlan`，直接按 playbook tool step 暴露候选工具摘要；`toolRouting` 继续保留为兼容视图
- `/api/chat` metadata 中的 `toolRouting` 当前已只在 `profile_compat` 时暴露；step / playbook_step 路由统一通过 `toolPlan` 呈现，避免把派生路由误当主事实源
- planner 当前已只在 `toolRoutingSource=profile_compat` 时才回退到旧 `toolRouting`；`playbook_step` 不再反向喂回核心执行链路
- 场景实例化已不再把派生 `toolRouting` 自动写回 `troubleshootingProfile`；兼容视图改为按需通过 helper 推导
- `request_evidence` 已开始把 `requiredEvidence / evidenceMatchers / evidenceMinMatches / fallbackKeywords` 编译成 evidence contract，并通过独立 evaluator 判断是否满足继续条件
- 工作记忆中的 `playbookProgress` 已开始持久化按 step 维度的 evidence state，多轮补材料可以累积 matcher / keyword 命中
- `plan` 与路由已开始共享 playbook progress 推导逻辑，`next / waiting_evidence / collecting_evidence / completed` 这些状态不再各自硬编码
- 已新增独立的 playbook progress 推导服务，`plan` 和 `/api/chat` 的工作记忆回写开始消费同一套 step status 规则
- playbook progress 已开始显式推导 `collecting_evidence / executing_tools / responding / completed` 四类 phase，planner 当前轮 runnable step 窗口开始优先按 phase + step status 决策
- 已开始把“当前轮应该执行哪些 step”也下沉到共享 playbook progress 服务，planner 不再自己拼接执行窗口
- `request_evidence` 的材料清单开始优先按当前 step 契约渲染，而不是只看 profile 级文案
- `answer` step 已开始携带 `outputSections / mustIncludeKeywords`，planner 会自动编译为回答约束
- `reflect` 已开始通过文件化 `conclusionSchema` 定义校验最小输出结构；当前已覆盖 `evidence_request_v1 / diagnosis_v1 / info_summary_v1`
- `answer` step 会继续叠加 `outputSections / mustIncludeKeywords` 这类 step 级约束，不满足时会继续下一轮
- 可以在 act 阶段调用知识检索和工具
 - 已新增 `request_evidence` 与 `playbook_response` 两类结构化动作

当前限制：

- `plan.ts` 里的 `need_more` 主要处理“输入缺失”，不是“证据不足”
- 虽然 playbook progress 已新增显式 phase，并开始按 phase + step status 推导 runnable step，但仍不是完整 playbook 阶段机；终止条件仍主要依赖 `answer / request_evidence / playbook_response`
- 证据契约已从 `plan.ts` 内联逻辑拆成 step-level evidence contract + evaluator，并开始持久化部分 evidence state；playbook progress 也已有共享 phase / status 推导，但当前仍不是完整 typed stage model
- `answer` 输出约束已开始结构化，但最终回答仍由 LLM 生成，尚未形成完全可验证的结论 schema 执行器
- 结构化校验已开始落到文件化 `conclusionSchema`，但当前仍是“最小 schema validator + step contract”组合态，不是统一 typed validator
- 路由层虽然已开始清理非排障场景的残留 playbook 进度，但这类状态治理仍是过渡态 helper，不是统一 session workflow 管理器

### 3.3 知识层

当前实现：

- 代码：`v1/src/services/knowledge/manager.ts`
- 注入位置：
  - `v1/src/agent/observe.ts`
  - `v1/src/agent/act.ts`

当前能力：

- 做语义召回
- 把知识片段注入上下文

当前限制：

- 检索到的是“案例片段”，不是“可执行步骤”
- 缺少完成条件、必需证据、可选分支等结构化信息

### 3.4 工具层

当前实现：

- 注册与发现：`v1/src/services/tools/registry.ts`
- 内置工具：`v1/src/services/tools/builtin.ts`
- K8s 管理：`v1/src/services/tools/k8s-management.ts`

当前能力：

- 支持 builtin / mcp / skill / script / shell
- MCP 工具可以运行时发现
- 有部分只读排查能力

当前限制：

- 监控排查很依赖运行时 MCP 配置
- `ssh_remote_management` 的 `exec` 受高风险门禁约束
- `k8s_management` 只允许只读 verb，不覆盖 `kubectl exec`
- 工具调用已开始从 profile 级 `toolRouting` 提示收敛到 step 级 `toolBindings`；文件化 playbook 已不再写入 `allowedToolNames`，但运行时仍保留旧字段兼容

### 3.5 输出层

当前实现：

- 回复生成：`v1/src/services/llm.ts`

当前能力：

- 可以生成自然语言分析
- 可以带部分 metadata 返回

当前限制：

- 没有被系统强制的结论结构
- “现象 / 证据 / 判断 / 建议 / 待验证项”仍依赖模型自觉

## 4. 当前已落地的主线收口

截至 2026-03-10，`eval/corpus.json` 的 15 个主线验收 case 已全部进入文件化 playbook 覆盖，当前场景包括：

- `clarify-first-secret-rebuild`
- `process-collection-reload`
- `dataid-basic-info`
- `chatinnerservice-success-rate-promql`
- `windows-bkmonitorbeat-inittempdir`
- `codev-dashboard-query-anomaly`
- `cluster-40980-vcluster-compatibility`
- `golden-shovel-oversea-drop-zero`
- `dream-star-dataid-metric-anomaly`
- `qcloud-exporter-redis-metric-no-data`
- `servicemonitor-stale-target-leak`
- `bkmonitorbeat-high-cpu-basereport`
- `naruto-dashboard-no-data`
- `cluster-41946-no-collection`
- `bkop-apm-service-cross-component-query`

这些场景当前主要复用四类既有 step：

- `request_evidence`
- `tool`
- `playbook_response`
- `answer`

其中已经稳定落地的能力包括：

- `/api/chat` metadata 会返回 `scenario / playbookId / conclusionSchema / needClarification / evidenceItems / toolPlan / toolRouting / toolRoutingSource / stepCount`
- `playbookProgress` 会跨轮持久化 `phase / nextStepId / stepStatusById / evidenceStateByStepId`
- `reflect` 会基于文件化 `conclusionSchema` 与 step contract 做最小结构校验
- corpus 覆盖关系已外置到 `eval/playbook-coverage-map.json`
- 旧的 `verify-playbook-coverage` 独立验收入口已下线，当前仅保留历史 coverage map 资产供设计与 compare 参考
- `make verify-local VERIFY_STAGE=tests` 当前聚焦 `v2:test + V2 harness + ChatOps` 守门，不再串联已下线的 playbook coverage 校验

需要明确的是：

- 当前场景主数据已转入 `v1/src/services/troubleshooting-playbooks.json`
- `v1/src/services/troubleshooting-scenarios.ts` 已收口为场景公共接口与 step contract builder；文件加载与启发式匹配已拆到独立服务，但 matcher 规则本身仍是代码过渡层
- 目标不是长期维持这种方式，而是把场景抽成外置 playbook 数据，让后续新增排障文档主要走“加数据，不改核心执行代码”

## 5. 与排障自动化目标的差距

围绕评估语料，当前最关键的五个缺口是：

1. 意图太粗，无法稳定命中排障子场景
2. 没有引导交互闭环，缺材料时仍容易直接猜测
3. playbook 阶段推进仍不完整，知识与结论结构还没有完全纳入统一执行契约
4. 工具没有场景化路由和前置证据门禁
5. 结论输出没有结构化验收契约

补充一条实现约束差距：

6. 场景虽然已开始外置化，但 matcher 与阶段机仍未完全数据驱动，新增复杂 case 还可能推动执行代码继续增长

## 6. 不再采用的旧理解

以下理解与当前实现不符，后续不要再作为默认前提：

- “主路径已经统一走 Orchestrator”
- “多专家协作已经是 Chat / CLI 的默认行为”
- “知识检索已经等价于排障流程执行”
- “当前输出已经天然符合可验收结论结构”

## 7. 推荐阅读顺序

1. `TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD`
2. `CURRENT-IMPLEMENTATION-MAP.MD`
3. `TROUBLESHOOTING-AUTOMATION-DESIGN.MD`
4. `../verification/VERIFICATION.MD`
5. `../verification/ITERATION-PLAN.MD`
