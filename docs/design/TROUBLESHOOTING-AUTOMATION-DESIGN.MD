# 排障自动化目标设计

> 目标：把真实排障笔记抽象为可执行的系统契约，让 `sre-copilot` 围绕评估语料持续收敛。
> 当前主验收路径：外部服务入口 `POST /api/chat`。

## 1. 设计目标

- 让系统能稳定识别排障类请求，并进入正确排障路径
- 让系统在缺材料时先做追问，而不是直接猜根因
- 让工具调用具备前置条件、证据要求和阶段边界
- 让结论输出有固定结构，便于人工验收和后续继续追问
- 让评估语料直接对应实现契约，而不是仅用于事后打分

## 2. 非目标

- 不是先做“全自动修复”
- 不是先追求多入口花式交互
- 不是先建设抽象知识图谱
- 不是先扩大功能面到更多不相关场景

## 3. 目标架构

后续排障主链路统一收敛为以下六层：

1. `Turn Modeling Layer`
2. `Thread Orchestration Layer`
3. `Playbook Layer`
4. `Interaction Layer`
5. `Tool Routing Layer`
6. `Conclusion Layer`

### 3.1 Turn Modeling Layer

输出不再只是一句 `troubleshoot`，而要先回答“这条新输入当前要解决什么”，最少包含这些字段：

- `turn_type`: 当前轮类型
- `intent`: 请求类型
- `scenario`: 排障场景
- `confidence`: 置信度
- `needs_clarification`: 是否缺关键上下文
- `entry_signals`: 进入该场景的命中依据
- `subgoals`: 当前轮拆出的子任务列表

建议的场景粒度示例：

- `metric-gap`
- `config-not-effective`
- `reload-or-dispatch-anomaly`
- `dataid-pipeline-break`
- `compatibility-validation`
- `stale-state-cleanup`
- `promql-semantic-false-positive`
- `process-collection-mismatch`

`turn_type` 至少需要覆盖：

- `continue_previous`
- `new_topic`
- `compound_request`
- `clarification`
- `constraint_update`

`subgoals` 的长期目标不是为了增加更多 prompt 文本，而是为了把“理解背景”和“执行任务”分开：

- 历史上下文用于帮助理解这轮请求
- 当前轮子任务用于驱动实际执行
- 不允许把整段历史上下文直接当作单个 planner 输入继续堆叠

### 3.2 Thread Orchestration Layer

当前轮任务建模之后，不应继续把所有 `subgoals` 直接塞进单条 loop 状态，而应形成“主线程 + 子线程”的运行结构。

主线程负责：

- 维护本轮全局目标、最高优先级约束、用户背景和原始输入
- 管理当前轮有哪些子线程、各自状态和优先级
- 汇总来自各子线程的 `evidence / guidance / hypothesis`
- 决定当前是否已经具备生成最终回答的条件
- 在自动路径不足时，决定何时进入“协作式推进”，与用户共同选择下一步

子线程负责：

- 每个独立场景、工具链路或子任务对应一个子线程
- 各自维护 `goal / status / evidence / guidance / toolAttempts / fallbackChain`
- 工具调用、失败换路、局部结论和待验证项在子线程内部闭环
- 知识命中只影响对应子线程，不允许直接污染整轮主结论
- 用户补充的截图、日志片段、PromQL、配置片段等证据也按子线程归属，和工具结果一起沉淀

当前阶段先落统一状态模型，不强求进程级 subagent；但设计上要按 subagent 式主从调度收口。

### 3.3 Playbook Layer

每个场景都应有一份结构化 playbook，而不是只靠知识片段。

这里有一条需要长期冻结的实现约束：

- 新增排障场景的长期目标应是“新增或更新 playbook 数据”，而不是继续修改核心执行代码
- 只有在出现新的步骤类型、工具能力模型或执行契约时，才允许改 `plan / act / reflect` 这类引擎代码
- 当前代码中的场景 registry 只是过渡态，不应被视为最终落地方式

建议最小字段：

```json
{
  "id": "process-collection-mismatch",
  "entry_conditions": ["采集配置无数据", "同机其他配置有数据"],
  "required_evidence": ["指标结果", "子配置内容", "目标进程信息", "日志片段"],
  "steps": [
    { "id": "s1", "type": "tool", "goal": "确认配置全局是否有数据" },
    { "id": "s2", "type": "tool", "goal": "确认目标主机插件是否工作正常" },
    { "id": "s3", "type": "interaction", "goal": "要求补充日志或配置文件" }
  ],
  "completion_criteria": ["定位根因或明确下一批必需材料"],
  "conclusion_schema": "diagnosis_v1"
}
```

### 3.4 Interaction Layer

系统必须支持显式的“缺材料”状态。

建议增加统一动作：

- `request_evidence`
- `request_confirmation`
- `continue_playbook`
- `handoff_to_subplaybook`
- `stop_with_partial_conclusion`

`request_evidence` 至少要带：

- `why`: 为什么要这份材料
- `items`: 要哪些材料
- `blocking`: 没有这些材料是否不能继续
- `examples`: 给用户的采集方式或命令模板

系统还需要显式支持“协作式推进”而不是只支持“自动完成”：

- 当工具缺失、权限不足、参数不够、现有证据互相矛盾或观测链路本身中断时，不应强行生成结论
- 主线程应把当前卡点分类为 `evidence_blocked / tooling_gap / permission_blocked / requires_user_decision`
- 对用户输出时，必须明确：
  - 当前已经确认了什么
  - 卡在哪一步
  - 推荐优先下一步
  - 备选下一步
  - 用户需要补的最小材料
- 如果存在多条可行路径，系统应给出各自成本和收益，让用户参与共同决策，而不是单向要求补材料
- 系统的完成标准不应只是“自己答出来了”，还应包括“把问题推进到用户下一步能高效补证的位置”
- 当前实现已开始把不同 blocker 绑定到不同推进动作：
  - `evidence_blocked`：优先继续 telemetry-first 验证
  - `tooling_gap`：先走 knowledge-guided path，自动路径耗尽后转 `request_evidence`
  - `permission_blocked`：停止盲重试，要求先修权限或改用替代证据

这里还需要补一条长期约束：

- 知识检索结果默认只产生 `guidance`
- 工具实时结果才产生 `evidence`
- 没有当前轮 `evidence` 时，系统只能输出假设、建议路径或待验证项，不能输出确定性结论

输入材料本身也需要从“整段拼接文本”升级为“原文 + 实体占位 + 按需展开”：

- 保留用户原始输入全文作为事实源
- 同时把工具名、业务 ID、链接、图片、文件、大文本块等抽成实体占位
- 子线程在真正需要时再按需加载对应实体内容
- 压缩后的 prompt 仅作为适配层，不能成为唯一事实源

用户主动提供的材料本身还需要成为一等证据对象，而不是只被当成普通聊天上下文：

- 截图、日志片段、PromQL、报错文本、配置片段、链路截图都应进入统一 evidence pipeline
- 工具证据和用户证据都要经过同一套“证据充分度 / 假设边界 / 待验证项”判断
- 即使系统暂时没有接任何工具，也应能依赖用户提供材料推进问题，体现垂类 agent 的长期价值沉淀

当前实现已开始落地这层抽象：

- `turnModel.userEvidenceItems` 已会提取用户输入中的 PromQL、报错、日志/配置片段以及附件元数据
- 子线程 prompt 现在会按 `threadId` 注入 `[用户提供证据]`，不再只带实体占位和工具结果
- `threadExecution` 已开始累计线程级 `userEvidenceItems`，主线程汇总时可以直接消费用户材料视图

### 3.5 Tool Routing Layer

工具调用不再只看“像不像相关工具”，而要和 playbook 步骤绑定。

每一步至少有：

- `allowed_tools`
- `required_params`
- `evidence_output`
- `success_criteria`
- `fallback_behavior`

这层要解决的问题：

- 什么时候该查指标，什么时候该看日志
- 哪些结论必须先拿到工具证据
- 哪些工具缺失时，应退回用户补材料
- 哪些动作属于只读排障，哪些需要明确确认
- 主路径拿不到足够证据时，下一条备用路径是什么

这里需要明确避免两类旧问题：

- 不再把关键词命中作为工具是否可用的唯一前提
- 不再把“已经生成一段答案”视为 loop 完成条件

更合理的运行方式应是：

1. 先读取知识库 / playbook / 历史排障文档，生成验证路径和常见误判点
2. 基于当前轮 `subgoals` 与实体线索，选择一组候选实时工具
3. 优先用 metrics / logs / traces 这类运行时信号验证“用户描述是否成立”
4. 若观测证据不足，再下钻到 `k8s / ssh / config` 这类对象面或基础设施面
5. 若主路径返回空结果、失败、旧知识命中或明显无关，则切备用路径
6. 只有在实时路径都不足时，才退回结构化补材料或用户共同决策

这里需要明确一个反直觉但重要的约束：

- 不能因为用户提到了 `pod / deployment / namespace` 就默认把 `k8s` 作为首跳
- 对 `sre-copilot` 这类系统，更合理的是 `knowledge-guided planning + telemetry-first verification`
- `k8s / ssh` 更适合作为解释层、补证层或观测失效时的下钻手段，而不是默认首跳

当前实现已开始向这层过渡：

- 规划器已去掉 `k8s_management` 的专用硬门禁，不再要求命中固定 K8s 关键词才允许进入候选
- `preferredToolClasses` 现在以排序加分为主，不再作为硬过滤，这为子线程保留了备用路径空间
- 当当前线程已抽到用户提供的 PromQL、错误日志等 telemetry 材料时，`query_*` 工具会得到额外排序加分
- `semantic_memory` 中的长期记忆、runbook 摘要和 OPAR 策略提示，已开始被编译为 `planning guidance`，同时进入规则排序和 LLM planning prompt
- 子线程已开始维护显式 `fallback chain`：当前线程某个工具只返回弱证据后，下一轮优先沿同线程未尝试候选继续，而不是重新全局盲选
- planner 已开始按 blocker 类型改写排序：`evidence_blocked` 会继续抬高 telemetry，`tooling_gap` 会提升 knowledge 并压低 SSH，避免无效重复尝试
- 当 fallback 链跑空且 blocker 已给出 `minimumUserInputs` 时，planner 会直接合成结构化 `request_evidence` 步骤，而不是只回一条泛化 blocker 文案
- `reflect` 已识别 `403/401/forbidden/权限不足` 等错误为 `permission_blocked`，用于阻止继续盲重试同类受限路径
- `planWithLLM` 现在会复用同一条 blocker-aware `candidateChain`，并把候选链及排序理由显式注入 `[候选工具链]`，避免 LLM 规划与规则规划分叉

在新的线程模型下，这里还需要满足：

- 工具候选和换路策略是子线程级的，不是全局共享一条链
- 主线程只消费子线程产出的结构化状态，不直接判断某个工具细节
- 不同子线程可按需加载不同实体，不共享已经展开的大上下文
- 主线程汇总 prompt 还应优先消费用户原始材料；当前实现已单独注入 `[主线程用户材料]`，并约束“用户材料不能自动等同于已确认事实，必须先用于收紧结论边界”
- 用户材料不应只保留 `promql / log / error / config` 这类原始类型；当前实现已进一步映射为“验证重点”，例如：
  - `observation_truth`
  - `query_correctness`
  - `runtime_failure`
  - `config_state`
  - `telemetry_correlation`
- planner 会基于这些验证重点决定“先验证现象是否成立、先校验查询是否写错、先看运行时错误，还是先检查配置状态”，而不是仅靠用户话术或对象名选工具
- 这组验证目标现在已正式进入 `subgoal / taskThread.validationIntent`，不再只是 planner 内部的临时 hints；后续主线程裁决、子线程换路和评估都应直接消费这层字段
- 当前实现已进一步让 `act / reflect` 直接消费 `taskThread.validationIntent`：
  - 主线程 answer guidance 会显式标注各子线程当前优先验证目标
  - blocker 摘要会指出当前卡在哪一类验证阶段，而不再只返回泛化的“继续验证”
- 当前实现已继续把这层信息接到协作式推进链路：
  - synthetic `request_evidence` 会携带当前 blocker 对应的 `validationSummary`
  - playbook `request_evidence` 也会从当前线程继承 `validationIntent`，保持补材料语境一致
  - 用户看到的补材料说明会显式写明“当前优先在补哪一类验证材料”，而不是只给一组脱离上下文的材料清单
- 运行态也应直接暴露这层信息：
  - `threadExecution` 需要携带子线程的 `validationIntent / validationStage / validationSummary`
  - chat metadata 需要提供轻量 `validationProgress`，让页面与验收报告可以直接看到“系统当前卡在哪一类验证阶段”

当前阶段还需要再冻结一条更具体的实现优先级，避免后续效果调优继续在不同证据面之间摇摆：

- 在当前环境已接入 `unify_query` 的前提下，默认主证据面应是 `unify_query`
- 对 `metric / log / trace / promql / query_raw / table_id / trace_id` 这类线索，默认优先：
  - `query_metrics`
  - `query_promql`
  - `query_raw`
  - `query_trace`
  - `query_log`
- 对 `pod / container / service / host / app_version / git_commit / system / trace / log / metric` 这类存在孤岛风险的实体线索，默认优先补一层关系验证：
  - `query_relation_multi_resource`
  - `query_relation_multi_resource_range`
- `service_locator` 的长期目标不应停留在“正则 + 用户上下文 + access matrix”，而应升级为“基于 relation 的实体定位与归属解析”
- `k8s / ssh / knowledge` 仍保留，但默认应处于：
  - telemetry 不足时的补证层
  - relation 已串联出对象后的下钻层
  - 或者知识/文档驱动的路径提示层

也就是当前阶段的默认排障主链应收口为：

1. `knowledge-guided planning`
2. `telemetry-first verification`
3. `entity-relation stitching`
4. `object/config follow-up`
5. `collaborative request_evidence`

这条优先级应同时约束 planner、service locator、线上回放 case 和后续验收矩阵。

### 3.6 Conclusion Layer

统一输出结构，不再只依赖 LLM 自由发挥。

建议固定为：

- `现象`
- `已确认事实`
- `当前判断`
- `根因/候选根因`
- `建议动作`
- `待验证项`
- `缺失材料`

其中：

- 若证据不足，不得输出单一确定根因
- 若已进入 `request_evidence`，必须显式列出缺失材料
- 若使用历史知识推断，需标明“来自历史案例推断”
- 若当前轮只有 `guidance`、没有 `evidence`，回答必须降级为“假设 / 建议 / 待验证”，不得冒充当前事实
- 主线程汇总时必须标明哪些事实来自哪个子线程，避免不同场景互相串味
- 当前实现已把默认主线程汇总合同固定为：
  - `现象`
  - `当前轮已确认事实`
  - `未确认假设`
  - `建议动作`
  - `待验证项`
- 当前实现已在 answer guidance 中强制区分“当前轮实时证据”与“历史经验提示”：
  - 历史知识、runbook、旧案例若被引用，必须显式写成“历史经验提示”
  - 这类内容不能写入“当前轮已确认事实”
- 当前实现已在 `reflect` 中补 `assessment`：
  - `evidenceScore`
  - `fallbackScore`
  - `conclusionScore`
  - `overallScore`
  这组分数用于显式评估“证据充分性”和“是否已经正确换路”，不再只看最终文案像不像答案

## 4. 与现有实现的对接方式

### 4.1 `/api/chat`

这是当前主改造入口：

- 统一进入新的排障主链路
- 补齐 intent 结构化输出
- 让 planner 能产出 `request_evidence`
- 让 metadata 能回传 playbook 和阶段信息

### 4.2 `agent/`

需要增强的点：

- `plan`：支持当前轮判定、主线程/子线程构建，以及从 playbook 生成步骤，不再只做“工具调用 + answer”
- `act`：支持子线程级 `request_evidence`、阶段推进、证据缓存、实体按需加载和备用路径执行
- `reflect`：根据子线程状态、证据充分度和是否仅命中历史知识来判断主线程是否完成
- `reflect`：除上述判断外，还需要输出结构化 `blocker`，明确是缺证据、工具缺口、权限阻塞还是需要用户共同决策

### 4.3 `knowledge/`

需要新增一层“排障知识结构化”：

- 文档片段继续保留，用于背景知识
- 但排障案例要额外抽取为 `scenario / evidence / steps / completion`
- 知识层默认输出 `guidance`，不能绕过当前轮证据门禁直接产出最终结论

### 4.4 `context/`

需要新增“实体引用 + 渐进式加载”能力：

- 原文保留：始终保留用户本轮原始输入、附件信息与可回溯位置
- 实体抽取：把工具名、业务 ID、trace_id、table_id、链接、图片/文件、大文本块等抽成 `EntityRef`
- 按需展开：由主线程或子线程在真正需要时才解析/加载实体内容
- 压缩层降级：`buildCompressedContext()` 只作为 prompt 适配，不再承担原始事实存储职责

### 4.5 `tools/`

需要补齐两件事：

- 工具能力清单与排障场景映射
- 读路径排障所需工具的可用性梳理

当前已补一份统一工具覆盖清单：`docs/tools/TOOL-COVERAGE-INVENTORY.MD`。
后续新增排障场景时，应优先复用该清单中的证据域与工具能力，并通过 playbook `toolBindings` 衔接，而不是继续在核心执行链路追加分支。

如果某些排障动作长期需要：

- SSH 只读远程命令
- `kubectl exec`
- 监控指标 / 日志 / DataID 链路查询

就不应继续把它们当成“临时存在的运行时条件”，而应纳入正式能力清单。

## 5. 文档与评估的绑定规则

从现在开始：

- 新增一个排障场景，必须先补评估 case
- 新增一个排障场景，长期目标应优先补 playbook 数据，而不是扩散新的 if/else 逻辑
- 调整排障逻辑，必须说明影响哪个 case 和哪个维度
- 新增工具，必须说明覆盖哪些 playbook 步骤
- 修改输出格式，必须同步更新验收规则
- 修改线程模型或实体加载策略，必须同步更新“主线程/子线程”和“实体占位/按需展开”回归用例

## 6. 阶段交付顺序

建议按以下顺序推进：

1. 主入口统一
2. 意图结构化
3. 主线程 / 子线程模型
4. 实体引用与渐进式加载
5. playbook 模型
6. 引导交互动作
7. 工具路由契约
8. 结论结构化
9. 多入口一致性

## 7. 关键决策

- 以评估语料驱动实现，不以抽象设计先行
- 先做好只读排障闭环，再考虑自动执行修复
- 先把 `Chat + CLI` 打透，再扩大到企微和其他入口
- 以“证据化结论”为第一目标，以“自动化程度”作为第二目标
- 当前允许代码内 registry 作为过渡态，但目标必须是“场景外置化 / playbook 数据化”，避免新增 case 持续 hardcode
