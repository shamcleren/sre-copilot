# SRE Copilot V2（Harness-First）重建方案

> ⚠️ **`v1/` 已于 2026-03-26 完成退场删除，V2 现为唯一主运行时。** 本文档中引用的 `v1/src/` 路径为历史记录。

> 结论：**可以重建，而且建议重建；但应重建 `runtime`，保留 `V1` 作为 `spec + eval + regression oracle`。**
>
> 这不是一次“情绪化重写”，而是一次有边界的 `V2` 孵化：让系统从“agent-first，规则逐步内卷”升级为“harness-first，契约驱动收敛”。

## 1. 为什么现在适合开 `V2`

当前仓库已经验证了方向，但也暴露出典型的二阶段问题：

- `agent` 主链路已经具备明显的结构化能力：线程、playbook、blocker、validation、service locator、tool routing
- `eval` 与 replay 已经开始发挥作用，但还没有成为系统骨架
- 部分场景策略仍然散落在 `plan.ts` 等引擎文件里，长期会把“新增场景”变成“继续补分支”
- 真实 case 已经逼近“轨迹正确性”问题，而不是单纯“回答像不像”问题

因此，当前不是“推倒一切重来”的时机，而是“把已有经验固化为 `V2` 约束”的时机。

## 2. `V2` 的核心判断

### 2.1 应该重建什么

应该重建：

- `runtime` 编排骨架
- `contract` 结构定义
- `harness` 目录与执行入口
- `playbook / policy / judge` 的边界
- `V1 -> V2` 的回归门禁

### 2.2 不应该丢掉什么

不应该丢掉：

- `eval/effect-tuning-cases.json`
- `eval/effect-tuning-cases-bkop.json`
- `scripts/test/test-effect-tuning-replay.js`
- `docs/design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD`
- 当前真实失败模式、回放习惯、线上经验

一句话说：

> **`V1` 的实现可以降级，`V1` 的样本、规则、回归和反例不能丢。**

## 3. `V2` 目标

`V2` 不是为了“写得更漂亮”，而是为了同时满足下面四件事：

1. **新增场景默认补数据，不补核心分支**
2. **评测先于实现，回归直接决定架构是否可接受**
3. **回答正确之外，还能验证轨迹、证据、结论契约是否正确**
4. **避免再次形成“被污染的中枢大脑文件”**

## 4. `V2` 非目标

`V2` 当前阶段不追求：

- 一开始就全面替换全部入口
- 一开始就追求全自动修复
- 一开始就做复杂多 agent 编排平台
- 一开始就覆盖所有历史场景
- 一开始就引入大而全的知识图谱

`V2` 第一阶段只要打通一条主线：

> **用户输入 -> 结构化任务建模 -> 候选轨迹 -> 工具执行/补证 -> 结构化结论 -> harness 判定**

## 5. 建议的仓库孵化方式

建议**先不新开独立仓库**，而是在当前仓库内孵化 `V2`，等通过关键回放后再决定是否拆仓。

推荐原因：

- 方便直接复用现有 `eval`、设计文档和回归脚本
- 便于做 `V1 / V2` 同 case 对比
- 避免重写期间丢失上下文与经验资产
- 在真正证明 `V2` 可收敛前，不急着增加仓库治理成本

建议目录：

```text
v2/
  package.json
  src/
    app/
    runtime/
    contracts/
    policies/
    playbooks/
    tools/
    adapters/
    observability/
  eval/
    specs/
    judges/
    runners/
    reports/
  tests/
  scripts/
```

如果后续确认 `V2` 稳定，再考虑把 `v2/` 提升为独立仓库。

## 6. `V2` 的一等公民：Harness

`V2` 的第一原则：**先定义怎么判对，再写怎么跑。**

因此 `harness` 不是辅助脚本，而是架构核心。最少要有四类判定：

### 6.1 Intent Contract

判断系统是否进入了正确模式：

- 是否进入排障链路
- 是否应该先补材料
- 是否识别出当前轮是新话题、延续还是复合任务

### 6.2 Trajectory Contract

判断系统是否走了合理路径：

- 第一跳是否合理
- 是否优先 telemetry-first
- 是否在证据不足时切到补证，而不是硬下结论
- 是否错误地下钻到 `k8s / ssh`

### 6.3 Evidence Contract

判断系统是否拿到了足够证据：

- 是否有当前轮实时证据
- 是否只是命中了历史知识
- 是否在证据不足时正确降级为假设/建议
- 是否满足场景定义的最小证据门槛

### 6.4 Response Contract

判断最终输出是否符合结论结构：

- 是否说明现象
- 是否区分已确认事实与未确认假设
- 是否指出建议动作
- 是否列出待验证项和缺失材料

## 7. `V2` 的核心边界

### 7.1 Runtime 只做通用编排

`runtime` 只负责：

- 接收结构化输入
- 生成执行状态
- 调用 policy / playbook / tool planner
- 合并 observation / evidence / blocker
- 决定继续、补证、收口

`runtime` **不负责**：

- 写死具体场景判断
- 写死业务名、工具优先级特判
- 直接内嵌“某个 case 要怎么处理”的细节

### 7.2 Policy 承担通用决策规则

`policies/` 用来存放跨场景但可外置的规则，例如：

- telemetry-first
- permission-blocked 后禁止盲重试
- relation-first 的适用条件
- request_evidence 的最小输出合同

### 7.3 Playbook 承担场景知识

`playbooks/` 用来存放场景化策略，例如：

- 某类指标掉零如何验证
- 某类服务异常应该优先查哪些信号
- 某类输入需要哪些最小材料
- 结论结构需要哪些必填块

长期约束：

> **新增场景时，默认修改 `playbooks/` 与 `eval/specs/`；只有出现新编排原语时，才允许修改 `runtime/`。**

## 8. `V2` 推荐目录职责

### 8.1 `src/contracts/`

定义所有结构化对象，最少包括：

- `TurnModel`
- `TaskThread`
- `PlanCandidate`
- `ToolCallIntent`
- `EvidenceItem`
- `Blocker`
- `Conclusion`
- `ReplayExpectation`

建议要求：

- 所有运行态对象都能序列化到报告
- 所有关键字段都能被 replay 读取和断言
- 任何输出给 LLM 的文本都只是视图，不是唯一事实源

### 8.2 `src/runtime/`

建议拆成以下模块：

- `model-turn.ts`：当前轮建模
- `spawn-threads.ts`：主线程/子线程初始化
- `plan-trajectory.ts`：候选路径规划
- `select-tool.ts`：工具与步骤绑定
- `apply-observation.ts`：消费工具结果/用户证据
- `evaluate-progress.ts`：判断是否继续、换路或收口
- `build-conclusion.ts`：结构化收口

### 8.3 `src/policies/`

放通用规则，例如：

- `telemetry-first.policy.ts`
- `request-evidence.policy.ts`
- `permission-blocked.policy.ts`
- `knowledge-is-guidance-only.policy.ts`

### 8.4 `src/playbooks/`

建议采用纯数据或弱逻辑数据结构，最少包含：

- `entry_conditions`
- `required_evidence`
- `steps`
- `allowed_tools`
- `fallbacks`
- `completion_criteria`
- `conclusion_schema`

### 8.5 `eval/specs/`

按来源和目的拆分：

```text
eval/specs/
  replay/
  regression/
  golden-path/
  live-samples/
```

建议把当前 `effect-tuning` 样本迁移进 `replay/`。

### 8.6 `eval/judges/`

至少拆为：

- `deterministic-judge`
- `semantic-judge`
- `trajectory-judge`
- `evidence-judge`
- `response-contract-judge`

## 9. `V2` 的最小执行流

建议 `V2` 第一版固定为下面七步：

1. `model_turn`
2. `spawn_threads`
3. `select_playbook_or_policy`
4. `plan_candidate_trajectory`
5. `execute_next_step_or_request_evidence`
6. `evaluate_evidence_and_blocker`
7. `build_structured_conclusion`

其中最重要的约束是：

- 没有证据，不允许给出确定性结论
- 没有定位对象，优先补证，不强行开查
- 已有 telemetry 线索时，不应默认先跳 `k8s / ssh`
- 轨迹跑偏要可见、可复盘、可被 harness 拦住

## 10. 推荐的 Case Schema 2.0

建议 `V2` 的 case 不再把期望混成一个 `expect` 大对象，而是显式分层：

```json
{
  "id": "A2",
  "input": {
    "message": "看下 unify-query 现在什么情况",
    "context": { "businessId": "2" }
  },
  "intent_contract": {
    "expected_mode": "continue_investigation",
    "must_not_mode": ["request_evidence"]
  },
  "trajectory_contract": {
    "preferred_first_tool_classes": ["unify_query"],
    "forbidden_first_tool_classes": ["k8s", "ssh"]
  },
  "evidence_contract": {
    "must_have_any": ["runtime_signal", "service_resolution"],
    "must_not_be_knowledge_only": true
  },
  "response_contract": {
    "semantic_criteria": ["应进入排查而不是泛化补材料"],
    "max_reply_length": 500
  }
}
```

这样做的好处是：

- failure 能直接定位到是哪一层坏了
- replay 报告不再只有“过/不过”
- 新增 judge 时不需要继续污染 case 解释逻辑

## 11. `V1 -> V2` 迁移映射

建议按下面方式迁移，而不是整块拷贝：

### 11.1 直接继承的资产

- `eval/effect-tuning-shared-baseline.json` -> `v2/eval/specs/replay/effect-tuning.json`
- `eval/effect-tuning-cases-bkop.json` -> `v2/eval/specs/replay/effect-tuning-bkop.json`
- `scripts/test/test-effect-tuning-replay.js` -> `v2/eval/runners/replay-runner.ts`
- `docs/design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD` -> 作为 `V2` 契约来源文档

### 11.2 只能参考、不要原样照搬的实现

- `v1/src/agent/plan.ts`
- `v1/src/agent/act.ts`
- `v1/src/agent/reflect.ts`
- `v1/src/agent/thread-execution.ts`
- `v1/src/services/service-locator.ts`
- `v1/src/services/entity-resolution.ts`

原因：这些文件里已经混有较多过渡态策略。它们适合作为经验来源，不适合作为 `V2` 基础层直接复制。

### 11.3 应优先外置的知识

从 `V1` 中优先抽离这些内容到 `V2`：

- telemetry-first 规则
- relation stitching 规则
- permission blocked 策略
- synthetic `request_evidence` 的输出合同
- 主线程 / 子线程收口门禁
- conclusion schema

## 12. 建议的实施顺序

### 阶段 0：冻结 `V1`

目标：停止在 `V1` 中继续做结构性扩写。

动作：

- `V1` 只做必要修复和线上保障
- 新场景原则上不再往 `plan.ts` 里加新的硬分支
- 把当前关键 replay case 固化为 `V2` 启动基线

### 阶段 1：先搭 Harness，再写 Runtime

目标：让 `V2` 一开始就有可判定的骨架。

动作：

- 建 `v2/eval/specs`
- 建 `v2/eval/judges`
- 建 `v2/eval/runners`
- 先把 `V1` case schema 升级成分层 contract
- 先跑通“读取 case -> 调用目标 -> 输出报告”

验收：

- 即使 `runtime` 还是空壳，也能跑出结构化失败报告

### 阶段 2：实现最小 Runtime

目标：只打通一条排障黄金路径。

建议覆盖：

- A1：无法定位时请求补材料
- A2：服务已定位时进入 telemetry-first
- B3：用户给 PromQL 时优先验证查询

验收：

- 至少 3 个关键 case 在 `V2` 首次稳定通过
- 报告能显示失败层级：intent / trajectory / evidence / response

### 阶段 3：把 `V1` 的经验抽成 Policy/Playbook

目标：证明 `V2` 的扩展方式是“加数据，不是加分支”。

动作：

- 抽第一批 playbook
- 抽第一批 policy
- 加 relation-driven 场景
- 加 blocker-aware request_evidence 场景

验收：

- 新增一个场景时，主要改动集中在 `playbooks/` 与 `eval/specs/`

### 阶段 4：并行对比 `V1 / V2`

目标：避免新系统“理论更干净，但真实效果更差”。

动作：

- 同 case 跑 `V1` 和 `V2`
- 对比 action、trajectory、evidence、response
- 只要 `V2` 未显著优于 `V1`，就不替换主入口

## 13. `V2` 的停止线与红线

### 13.1 可以接受的信号

- 新增场景主要改 `playbook + eval`
- `runtime` 文件规模稳定，没有持续膨胀
- replay failure 能直接定位到 contract 层
- 轨迹漂移能在报告中明确体现

### 13.2 必须立即纠偏的信号

- 新增 case 仍然频繁要求改 `runtime/plan` 核心逻辑
- replay 仍然只能看最终回复，看不到轨迹与证据
- 关键规则继续散落在 prompt 文案或单文件 if/else 中
- `V2` 只是把 `V1` 原样换目录复制了一遍

## 14. 首批迁移清单

建议优先迁以下 8 项：

1. 建 `v2/` 目录骨架
2. 迁移现有 replay case 到 `v2/eval/specs/replay/`
3. 重写 replay runner 为分层 contract 输出
4. 定义 `TurnModel / Evidence / Blocker / Conclusion` 合同
5. 实现最小 `request_evidence` 路径
6. 实现最小 telemetry-first 路径
7. 实现结构化 conclusion builder
8. 做 `V1 / V2` 同 case diff 报告

## 15. 对当前项目的建议结论

对当前仓库，建议采用下面的执行口径：

- **短期**：`V1` 冻结为线上保障版本
- **中期**：在当前仓库内孵化 `v2/`
- **原则**：所有 `V2` 新增能力必须先补 replay contract
- **验收**：以关键 case 的稳定通过率与 failure 可解释性为第一目标
- **切换条件**：`V2` 至少稳定覆盖当前最重要的一批真实 case 后，再考虑替换主入口

最终判断：

> **可以重建，而且值得重建；但正确方式不是“重写一个更干净的 agent”，而是“重建一个更强约束、更可验证的 harness-first 系统”。**
