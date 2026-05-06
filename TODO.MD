# 项目待办清单（统一）

> 唯一待办清单文件。其他文档不再保留 TODO 字样。
> 最后更新：2026-03-26
> 状态：排障自动化进入"效果优先、性能后置"调优期，主线为"先把真实排障效果调稳，再做性能与 token 优化"；统一离线验收 `make verify-local-tests` 当前已恢复全绿。

## 当前项目状态

| 维度 | 状态 |
|------|------|
| 主验收入口 | 外部服务入口 `POST /api/chat` |
| 主验收基线 | `eval/corpus.json` |
| 当前系统定位 | 排障助手（非 playbook 执行器） |
| V1 当前角色 | ✅ 已于 2026-03-26 物理删除，历史 baseline 保留在 `eval/` |
| V2 当前定位 | `harness-first runtime`，唯一主运行时 |
| V2 长期目标 | 持续效果调优 + 新场景扩展 + 工具链补齐 |
| 已固定结论 | 主入口不统一、意图过粗、缺少追问动作、缺少 playbook 契约 |
| 当前重点 | 真实对话效果调优 + case 回放固化 + 协作式补材料收敛 |
| LLM 交叉测试基础 | `minimax` provider 已接入，可与 `bk_ai` 切换 |
| LLM 可观测现状 | `/api/chat` metadata 已回传 `provider / endpoint / model / requestType / stream` |

## 下一阶段待办（按需推进）

### P9 真实效果调优与线上回放

- [x] 将"远端部署后 health + token phase API + 专家排障入口"收口为稳定的 `make verify-online` 验收入口，并要求后续功能默认执行本地 + 远端双验收
- [x] 修复专家对话当前轮历史串扰：`new_topic / compound_request` 默认不再把整段近期对话压回 loop 输入，planning context 也只在延续类 turn 上拉完整会话依赖
- [x] 将 `k8s_management` 升级为"结构化安全动作 + 受控只读 exec"，并把敏感只读操作改为显式确认而非直接执行
- [x] 补齐运行镜像 `kubectl` 依赖，修复线上 `spawn kubectl ENOENT`
- [x] 增加"服务定位层"：对于"我的服务情况"这类请求，先尝试从用户/业务/实体上下文定位服务对象；若仍无法唯一定位，则直接短路为结构化补材料请求
- [x] 修复 `request_evidence / playbook_response` 首轮完成时未写入主输出、最终落入通用 fallback 的主链路缺陷
- [x] 将线上"效果不理想"的真实对话沉淀为固定回放 case，已形成独立发布守门集 `eval/effect-tuning-release-gate.json`，并通过 `make verify-effect-tuning-gate` / `make verify-online` 要求后续调优先过回放再发布
- [x] 按 `docs/verification/EFFECT-TUNING-CASE-MATRIX.MD` 建立效果调优回放集：当前最小守门集固定覆盖 `ET-A1 / ET-A2 / ET-B1 / ET-C1 / ET-D1 / ET-E1`，满足 A/B/C/D/E 五类 case 至少各 1 个
- [x] 补齐"我的服务情况"正向命中链路验收：已用 `ET-A2 / ET-A3 / ET-A4` 固定服务名 / Pod 名 / 域名三类正向回归，并为主入口首跳 tool request 补齐守门断言，确保继续实时排查而不是停在补材料
- [x] 将 `unify_query` 提升为默认主遥测面：在当前环境可观测数据完备时，优先用 `query_metrics / query_promql / query_raw / query_trace / query_log` 验证现象，而不是过早落到对象面或知识面
- [x] 将 `query_relation_multi_resource` 纳入主链路规划：当输入或工具结果里出现 `pod / container / service / host / app_version / git_commit / trace / log` 等实体时，优先用关系查询把数据孤岛串起来，再决定下一步取证
- [x] 升级 `service_locator`：`V2` 已显式区分 `targetResolutionSource / validationFocus`，业务上下文会先走 `relation` 解析归属 `service / deployment`，再回到 `telemetry-first`
- [x] 收紧"现象真实性 / 查询正确性"验证优先级：`V2` 已把 `query_correctness / symptom_truth / entity_resolution` 固化进合同、首跳工具规划与结论文案，并用回归锁住"先证伪再下钻"
- [x] 收紧弱证据场景的回答风格：优先输出简短协作式推进，不再扩写泛化排障手册
- [x] 为 `service_locator / telemetry-first / request_evidence / entity-relation` 主链增加线上目标场景验收矩阵：`docs/verification/MAINCHAIN-ACCEPTANCE-MATRIX.MD` 已固化四类分支，并通过 `verify-online` 内置 `ET-A1 / ET-A2 / ET-B1 / ET-C1 / ET-D1 / ET-E1` 最小守门集串到远端回放

### P10 性能优化（在效果稳定后推进） ✅ 已完成（2026-03-26）

- [x] 优化专家排障链路线上延迟；原线上延迟 `40s ~ 80s` 主要来自 V1 Agent Loop 多轮 LLM 调用；v1 删除后纯 V2 路径端到端延迟已降到 `<1s`（规则化 modelTurn + 规则化 toolPlan + 并行工具执行 + 模板化结论），前置 LLM 意图识别（avg 8s）也随 v1 路由一起消除
  - [x] 已补统一 phase 观测，并确认前置 `intentInference` 是首个可收紧热点；`chat` 主入口现已改为轻量记忆预算（`historyTokenBudget=320`、跳过 `roles` / `longTerm`），避免进入 `V2` 或回退 `V1` 前先做重记忆拼装
  - [x] v1 删除后纯 V2 路径不再经过 LLM 意图识别和 V1 toolPlanning/replyGeneration，`40-80s` 延迟根因已消除
- [x] 为 `intentInference / toolPlanning / replyGeneration` 三段补齐 prompt 大小、token 数、耗时与命中模型的统一观测：`v2:status` / `V2-READINESS-STATUS.MD` 已统一输出请求数、成功/失败、Prompt/Completion/Total Tokens、Prompt 体积与 Top Model，并直接标出最慢阶段与最大 Prompt 阶段
- [x] 按任务类型做模型分流：`bk_ai` 已为 `intentInference / toolPlanning` 增加 phase-aware 选模，默认优先走快模型（`deepseek-v3` / 可单独覆写 `BK_INTENT_LLM_MODEL`、`BK_TOOL_PLANNING_LLM_MODEL`），主回复链路继续保留高质量模型兜底
- [x] ✅ 缓存策略评估已完成 — **结论：不引入 subprocess cache**。V2 纯函数阶段（modelTurn / chooseMode / buildConclusion）计算代价 <2ms，缓存收益近零；工具执行阶段（占延迟 99%+）返回实时遥测数据（metrics/logs/traces 均带时间窗口），缓存会导致过期数据用于排障决策，是有害的。SRE 排障查询天然唯一性高（不同业务 × 不同服务 × 不同时间窗口），预估缓存命中率 <5%。如未来 modelTurn 引入 LLM 推理，再重新评估

### P11 V2 替换 V1 迁移路线 ✅ 已完成（2026-03-26）

- [x] 固定迁移原则：`V1` 继续作为线上保障版本与 `spec / eval / regression oracle`，`V2` 在当前仓库内按 `harness-first` 路线孵化
- [x] 建立 `V2` 基线骨架：`v2/` 目录、contract/replay runner、`v2:verify`、`v2:compare` 与 `V1 / V2` diff 报告已齐备
- [x] 补齐 `V2` 真实执行 adapter：已接通首条真实工具执行链路，不再只做 replay/contract 推演
  - [x] 扩展 `V2` adapter 合同：已补齐工具调用、观测结果、标准化 evidence/blocker 映射，不再只保留 `name / description`
  - [x] 首批接通 `unify_query` bridge：已桥接 `query_metrics / query_promql / query_trace / query_log / query_relation_multi_resource`
  - [x] 让 `runV2Turn / executeCase` 支持注入 adapter 并消费真实工具结果，避免仅靠 `deriveEvidence(...)` 生成静态 evidence
  - [x] 为 adapter 失败语义做统一归一：已覆盖空结果、超时、鉴权失败、权限阻塞等 blocker 映射，并回写 `evidence / blocker / conclusion`
  - [x] 为首批 adapter 补齐回归：`mock` 工具测试、`smoke` 与 `V1` 同 case diff 已纳入统一校验入口
- [x] 完成 `bootstrapV2` 与 `smoke` 验收：已去掉 placeholder / pending 状态，提供可直接启动、可验证的独立入口
- [x] 将 `V2` 接入灰度主入口：已为 `/api/chat` 与 `/api/chat/stream` 提供可控切流，支持与 `V1` 并行对比
  - [x] `/api/chat` 主路径保持不变，已新增显式 `V2` 实验开关（`strategy=V2` 或 `x-sre-copilot-route: v2`），默认仍走 `V1`
  - [x] 灰度入口已补齐可回滚机制与运行态标识：`V2` 异常自动回退 `V1`，响应 metadata 回传 `routeMetadata / v2RuntimeObservability`
- [x] 建立 `V2` 真实场景验收矩阵：已新增 `docs/verification/V2-ACCEPTANCE-MATRIX.MD`，除 replay 外补齐主入口、工具执行、协作补材料、权限阻塞、回滚路径五类回归
- [x] 持续迁移 `V1` 经验到 `V2` 的 `playbooks / policies / contracts`：当前 acceptance matrix / replay contract / strict compare / readiness watchlist 已对齐，新增场景默认补数据与契约，不再向 `V1` 主链路追加结构性分支
- [x] 明确替换门槛：已新增 `docs/verification/V2-READINESS-CHECKLIST.MD` 与 `npm run v2:status` / `make v2-readiness-status`，固定关键真实 case、`V1 / V2` compare、灰度回滚与 readiness 状态判据
- [x] 满足门槛后执行最终切换：`V2` 已接管主入口，`V1` 降级为 `spec / eval / oracle` 与兜底回滚资产
- [x] 按顶层 `V1 / V2 / 公共层` 收口仓库结构，避免当前 `nodejs + v2` 的过渡态长期固化
  - [x] 已将原 `nodejs/` 物理迁移到 `v1/`，根目录 `v1:*` 入口与 `v2 -> v1` 依赖已同步修正
  - [x] 已固定公共层边界：根目录 `package.json` / `Makefile`、`scripts/`、`config/`、部署资产与统一文档索引继续留在仓库顶层
  - [x] 已按 `shared / V1 / V2` 收口当前文档：`V1` 保留回滚/基线说明，`V2` 保留 runtime/readiness/acceptance，跨版本说明仍统一收在 `docs/`

### P12 V1 退场与开发接力（handoff）

- [x] 明确 `V1` 物理删除门槛：从"已替换主入口"扩展到"已去掉 oracle / rollback / tooling 依赖"，作为独立阶段推进，不再混入 `P11`
- [x] 为 `runtime:handoff` 建立一等入口：沿用 `project-context-status`，输出当前重点、活跃未完成项、脏文件热点、建议验证命令与可直接粘贴的新 session handoff prompt
- [x] 梳理并迁移 `v1` 工程依赖：已去掉 `v1/node_modules` 作为 `v2 verify / status / context / compat route regression` 的执行前提
  - [x] 已为仓库根目录补齐 `tsx / typescript` runtime tooling，`runtime:handoff / context / test / smoke / replay / compare` 与 `v2:status` 的 TS 执行链已不再依赖 `v1/node_modules/.bin/tsx`
  - [x] 已将"纯 `V2` runtime 回归"和"跨版本兼容回归"拆成独立 gate：新增 `v2:verify:core` / `v2:verify:compat` 与对应 `runtime:*` / `Makefile` 入口
  - [x] `v2:status` 已改为以纯 `V2` baseline / readiness 判据为主，compat 结果仅作为跨版本 oracle 观察项；聚合 `v2:verify` 仍保留 full gate 语义
  - [x] `v2/` 内对 `v1` 运行态模块的直接 import 已收拢到 `v2/src/observability/legacy-v1-observability.ts`，不再散落在 runner 内部
  - [x] 已将 `verify-v2-compat.sh` 从硬编码 `v1/node_modules/.bin/jest` 迁到根目录 `npm run v2:test:route-regression` + `scripts/test/jest.v2-compat.config.cjs`，compat gate 不再依赖 `v1` 独立测试工程的执行入口
  - [x] 已将 compat route regression 测试文件迁到仓库根 `tests/compat/`，`v1` 侧仅保留脚本代理，不再承载这两份测试源码
  - [x] 已为仓库根补齐 compat 所需最小运行时依赖 `fastify`，并移除 `scripts/test/jest.v2-compat.config.cjs` 对 `v1/node_modules` 的解析兜底
- [x] 已将 `runtime:verify` 从 `V1/V2 compare` 与 `V1 route oracle` 的 full gate 语义中解耦：`runtime:verify` 现回到纯 `V2` core gate，显式 full verify 改为 `runtime:verify:full`
- [x] 已补显式 `V2` 无 fallback 的线上验收入口；仍需在真实观测窗口内执行并确认稳定，再执行物理删除与文档收口
- [x] 收口 `V2 -> V1` 运行时硬依赖，确保物理删除 `v1/` 前 `V2` 不再直接 import `v1/src/*`
  - [x] 迁走 `v2/src/adapters/unify-query.ts` 对 `v1/src/services/tools/unify-query` 与 `ToolContext` 的直接桥接：`V1` 路由现预加载系统级 `unify_query` 配置并通过 `adapterContext.unifyQueryConfig` 透传，`V2` adapter 已改为直接调用 UnifyQuery API
  - [x] 迁走 `v2/src/observability/legacy-v1-observability.ts` 对 `v1` 数据库、token、LLM、tool、route runtime 统计模块的直接依赖：`V2` 现已内置只读 DB 聚合与 readiness 所需 SQL，`runtime:status` 不再借道 `V1` 观测模块
- [x] 收口 compat / route regression 对 `v1` 源码工程的依赖，避免测试层继续阻塞 `v1/` 退场
  - [x] 去掉 `tests/compat/*.ts` 对 `v1/src/routes/chat`、`v1/src/services/v2-chat-router` 等实现的直接 import：已新增仓库根 `compat/chat-routes.ts` 与 `compat/v2-chat-router.ts` facade，route regression 现通过稳定入口引用实现
  - [x] 去掉 `tests/compat/tsconfig.json` 对 `../../v1/tsconfig.json` 的继承，改为仓库根或 `v2/` 独立测试基线：compat 测试现使用仓库根独立 TS 基线，不再借道 `v1` 工程配置
  - [x] 继续收口 `tests/compat/*.ts` 内部 `jest.mock('../../v1/src/...')` 路径耦合
- [x] 重构跨版本 oracle / replay 资产，明确哪些继续保留为归档基线，哪些改为纯 `V2` 守门
  - [x] 评估并改造 `v2/eval/runners/compare-v1-v2.ts`、`scripts/test/verify-v2-compat.sh`、`scripts/test/report-v2-readiness.sh`
  - [x] 梳理 `eval/effect-tuning-cases*.json`、`scripts/test/test-effect-tuning-replay.js` 与 release gate 的长期归属，收口 `V1 replay` 语义
    - [x] 已引入 `eval/effect-tuning-shared-baseline.json` 作为共享 baseline 主入口
    - [x] replay 脚本输出已改为 `BASELINE-REPLAY-*`，compare 同时兼容新旧报告名
- [x] 迁移开发 / 构建 / 部署 / 运维工具链中的 `v1` 入口，避免删除目录后根入口立即失效
  - [x] 清理根 `package.json`、`Makefile`、`.gitignore`、`prune-workspace-artifacts.sh` 中的 `v1` 依赖
  - [x] 删除 `compat/`、`tests/compat/`、`scripts/test/jest.v2-compat.config.cjs`（v1 桥接层随 v1 退场一起删除）
- [x] ✅ **`v1/` 已物理删除** — `v2:test` 15/15 全绿，仓库已无 `v1/src/*` import，`package.json` 已无 `v1:*` 脚本

### P0 主链路整治基线

- [x] 固定本轮改造边界：不再靠补意图关键词或单点特判修主链路问题
- [x] 明确知识检索角色：只作为路径提示与参数线索，不默认作为最终结论来源
- [x] 为 `Chat / CLI / 专家对话` 统一"实时证据优先"的验收口径，已补 `srectl` 契约回归、企微专家对话回归与 loop 主链验证

### P1 当前轮任务建模

- [x] 为每条新输入增加"当前轮判定"，至少区分：延续上轮 / 新话题 / 复合请求 / 追问纠偏 / 约束更新
- [x] 为当前轮增加子任务切分能力，避免把多个独立诉求直接堆进单条 planner 输入
- [x] 为子任务定义统一结构：`goal / constraints / expected_evidence / preferred_tool_classes`
- [x] 为 `/api/chat` 与专家对话回传当前轮判定与子任务摘要，作为可观测 metadata
- [x] 将当前轮子任务升级为"主线程 + 子线程"执行模型，避免所有场景继续共用单条 loop 状态

### P2 证据模型与知识分层

- [x] 建立 `evidence / guidance / hypothesis` 三层模型，替代"有内容就能回答"的松散约束
- [x] 明确知识库默认产物为 `guidance`，只能驱动下一步，不直接产出确定性结论
- [x] 约束最终答案：没有当前轮实时 `evidence` 时，只能输出假设、建议路径或待验证项
- [x] 把"旧知识命中 / 历史失败记录 / 空结果工具输出"标记为不足以完成任务的证据类型
- [x] `reflect` 已开始基于子线程 bundle 质量识别"只有 guidance/hypothesis、没有实时 evidence"的伪收口
- [x] 将用户提供的截图、日志片段、报错、PromQL、配置片段纳入一等证据对象，而不是只当普通聊天上下文
- [x] 让 `主线程` 只负责背景、约束、证据汇总和结论裁决，`子线程` 负责工具尝试、失败换路和局部证据沉淀

### P3 搜索式 loop 与换路策略

- [x] 在 loop 中引入"主路径失败 -> 备用路径继续"的统一策略，而不是只靠 `MAX_STEPS`
- [x] 将"空结果 / source=none / 未配置 / 明显无关 / 仅知识命中"统一视为需要继续搜索的信号
- [x] 工具选择从硬门控改为"能力排序 + 备用链"，关键词只参与排序不负责一票否决
- [x] 将工具选择改为 `knowledge-guided planning + telemetry-first verification`，不固化全局工具顺序
- [x] 为 `reflect` 增加"伪完成"识别，避免答案仅复述旧知识时提前停机
- [x] 将 loop 的完成判定从"整轮 done"改为"各子线程状态 + 主线程是否已具备可汇总结论"
- [x] 为 loop 增加结构化卡点分类：`evidence_blocked / tooling_gap / permission_blocked / requires_user_decision`
- [x] `reflect` 已开始消费 `taskThread.validationIntent`，卡点说明会明确指出当前卡在"现象真实性验证 / 查询正确性验证 / telemetry 关联验证"等哪一类验证阶段
- [x] `threadExecution` 与 chat metadata 已开始透出线程级 `validationIntent / validationStage / validationSummary`，运行态可直接回答"当前卡在哪个验证阶段"
- [x] synthetic `request_evidence` 已开始显式说明"当前优先在补哪类验证材料"，不再只返回脱离验证语境的材料清单
- [x] playbook `request_evidence` 也已开始继承当前线程验证目标，补材料说明不再只在 synthetic blocker 路径上可见

### P4 结论与汇总结构

- [x] 固定子任务汇总输出：`现象 / 当前轮已确认事实 / 未确认假设 / 建议动作 / 待验证项`
- [x] 在答案中显式区分"当前轮实时证据"与"历史经验提示"
- [x] 建立"子任务完成态 -> 汇总回答"规则，避免多个子场景互相污染
- [x] 将证据充分性与换路行为纳入评估打分，`reflect.assessment` 已回传 `evidence/fallback/conclusion/overall` 分数
- [x] 主线程汇总时显式区分"来自哪个子线程的证据/假设/待验证项"
- [x] `threadExecution` 已开始累计子线程级 `evidence / guidance / hypothesis` 摘要，主线程 answer 可直接消费子线程证据视图
- [x] 主线程 answer guidance 已开始消费 `taskThread.validationIntent`，会显式提示当前子线程优先验证目标与对应验证重点
- [x] 支持"协作式推进"输出：明确当前卡点、推荐下一步、备选下一步以及用户最小补充材料
- [x] `Reflection.blocker` 已开始透传到最终协作式回复与 chat metadata，系统卡住时不再只返回泛化兜底文案
- [x] `agentRuntimeObservability.validationProgress` 已开始汇总主线程/子线程的验证阶段、验证目标与证据数量，便于后续页面和验收直接消费
- [x] 对话工作台调试面板与 Admin 意图探针已开始展示线程级验证进度和 blocker，当前可直接看到"在验证什么 / 卡在哪一步"

### P5 Playbook 与工具数据化衔接

- [x] 为首批高价值场景建立 playbook schema
- [x] 落地第一版文件化 playbook 外置承载（`v1/src/services/troubleshooting-playbooks.json`）
- [x] 将新的子任务模型与既有 playbook step 对齐，当前 playbook step 已显式挂载到子线程元数据并有回归覆盖
- [x] 梳理排障所需工具覆盖清单（监控 / 日志 / SSH / K8s / DataID / UnifyQuery）
- [x] 继续收敛到"新增排障文档主要走加数据，不改核心执行代码"

### P6 实体引用与渐进式加载

- [x] 为用户原始输入建立 `raw input + entity refs + resolved entities` 三层表示，不再只保留压缩后的 prompt 文本
- [x] 把工具名、业务 ID、table_id、trace_id、链接、图片/文件、大文本块等抽成占位符，并保留原文位置
- [x] 子线程按需加载实体内容，避免将所有附件、长文本和链接正文一次性注入上下文
- [x] `plan` 已开始读取当前子线程实体线索，用于工具排序与参数补全，不再只在 answer prompt 中消费实体摘要
- [x] 已支持按 `threadId` 渐进式加载当前线程原文片段，prompt 中同时保留实体占位与按需展开的原文摘录
- [x] 保证原文始终可回溯，压缩层只作为 prompt 适配，不再作为唯一事实源

### P7 回归与验收

- [x] 增加"知识命中但实时查询缺失"回归 case，防止旧知识直接盖过现状
- [x] 增加"单轮复合请求"回归 case，验证子任务切分和汇总
- [x] 增加"主线程 + 多子线程"回归 case，验证场景隔离和最终汇总
- [x] 增加"主路径空结果后切备用路径"回归 case，验证 loop 的搜索行为
- [x] 增加"实体占位 + 按需加载"回归 case，验证原文保留和渐进式展开
- [x] 增加专家对话与 `/api/chat` 的一致性回归，避免入口行为再度分叉
- [x] 统一离线验收入口为 `make verify-local-tests`，历史上曾覆盖 `Playbook Coverage` 与旧 `test:no-llm` 组合；当前已收口为 `v2:test + V2 harness + ChatOps` 守门，并恢复当前基线全绿

### P8 LLM Provider 交叉测试与可观测深化

- [x] 接入 `minimax` provider，支持以 OpenAI 兼容协议切换运行
- [x] 为聊天链路补齐 LLM 运行态可观测：明确 `provider / apiBase / endpoint / model / requestType / stream`
- [x] 在聊天调试面板与 Admin 意图探针展示 `llmObservability`
- [x] 增加 `bk_ai / minimax` 交叉测试入口，支持同一问题并排对比结果、耗时与 token 消耗
- [x] 将 `llmObservability` 下沉到独立可观测页面，而不只停留在聊天 metadata 与调试面板
- [x] 将 token 消耗明细与 `intentInference / toolPlanning / replyGeneration` 三段链路统一关联展示
- [x] 补齐 benchmark 专用模型选项接口与页面多选模型选择，不再依赖手填模型字符串
- [x] 基于 `eval/corpus.json` 固化默认 LLM 交叉 benchmark case 集，并提供 `make benchmark-llm-cross` 落盘基线报告

### 已决策暂缓

- [x] 告警自动响应链路：暂缓 | 待排障主链路成熟后再评估
- [x] 富交互企微体验：暂缓 | 当前先不做主验收入口

## 已完成（2026-03-09 本轮）

- [x] 排障评估语料升级为链路型 schema
- [x] 结构化 grader 与评估执行脚本重构
- [x] 固定当前系统静态评估结论
- [x] 建立排障自动化设计、验收、进度文档主线
- [x] 补第一批场景化实现样板：`26948 secret 重建`、`100915 进程采集未 reload`
- [x] `/api/chat` 已开始回传 `scenario / needClarification / evidenceItems / stepCount`
- [x] `agent` 已支持 `request_evidence` 与 `playbook_response`
- [x] 已补第三个样板 `DataID 基本信息查询`，并接入 tool-first playbook 与工具路由提示
- [x] 已将首批场景 / playbook 主数据外置到 `v1/src/services/troubleshooting-playbooks.json`
- [x] `agent plan` 已能按 playbook step 序列规划多步工具与回答，而不再只消费前两步
- [x] 工作记忆已开始持久化 playbook 进度，支持跨轮跳过已完成 step 与补材料后继续推进
- [x] 首批 `request_evidence` step 已开始使用文件化 `evidenceMatchers` 描述继续条件
- [x] `request_evidence` 的继续条件已开始收敛为 evidence contract + evaluator
- [x] 工作记忆已开始持久化 step 级 evidence state，支持多轮补材料累积
- [x] `plan` 与路由已开始共享 playbook step status 推导
- [x] 已新增独立 playbook progress 推导服务，阶段推进核心判定开始收口
- [x] playbook progress 已开始显式推导 `collecting_evidence / executing_tools / responding / completed` phase
- [x] 当前轮 runnable step 窗口已开始走共享 progress 服务
- [x] playbook step 到具体 action 的编译逻辑已从 `plan.ts` 抽到独立 planner service
- [x] 工作记忆中的 playbook 进度读取、pending evidence 补齐判断与历史完成态合并已从 `plan.ts` 抽到独立 helper
- [x] 场景命中优先级已数据化为 `priority`，不再依赖 JSON 文件顺序
- [x] 已新增 `ChatInnerService 成功率 PromQL 误报` 与 `Windows bkmonitorbeat InitTempDir 启动失败` 两个主线 playbook 场景
- [x] 已新增 `CodeV 仪表盘查询异常` 与 `40980 vCluster 采集异常` 两个主线 playbook 场景
- [x] 已新增 `金铲铲海外版在线人数掉零` 与 `元梦之星 DataID 指标异常` 两个主线 playbook 场景
- [x] 已新增 `qcloud-exporter Redis 指标无数据` 与 `ServiceMonitor 已删除 Pod 未清理` 两个主线 playbook 场景
- [x] 已新增 `bkmonitorbeat CPU 异常飙高` 主线 playbook 场景
- [x] 已新增 `火影忍者查询无数据` 主线 tool-first playbook 场景
- [x] 已新增 `41946 集群采集无数据` 与 `APM Service 关联模型查询异常` 两个主线 playbook 场景
- [x] 已接入 `minimax` LLM provider，支持通过 `LLM_PROVIDER=minimax` 走 OpenAI 兼容接口
- [x] `/api/chat` 与 `/api/chat/stream` 已新增 `llmObservability`，可回传本轮使用的 LLM provider、endpoint、model、requestType 与 stream 状态
- [x] 聊天调试面板与 Admin 意图探针已展示 `llmObservability`，便于确认 token 消耗来自哪个接口、哪个模型、用于哪一段链路
- [x] Admin 已新增 `bk_ai / minimax` 交叉测试入口与 benchmark 结果区，可页面直观看到 provider、endpoint、model、latency、tokens 与输出长度
- [x] `/observability` 页面已新增 LLM benchmark 区，并为最近 token 记录补充 provider 列，支持直接从独立可观测页查看 provider × model 矩阵结果
- [x] 用户输入中的 PromQL、报错、日志/配置片段与附件元数据已开始提取为 `userEvidenceItems`，并按线程进入 prompt 与线程证据摘要
- [x] 动态工具选择已去掉 `k8s_management` 的硬门禁；用户提供的 telemetry 材料会开始提升 `query_*` 工具排序
- [x] `semantic_memory` 中的 runbook / OPAR 提示已开始编译为 `planning guidance`，前置参与工具排序与 LLM planning prompt
- [x] 线程级 fallback 链已开始显式维护：同线程工具若已尝试且只返回弱证据，下一轮会优先选未尝试候选，而不是重新盲选
- [x] blocker 已开始真正影响换路策略：`evidence_blocked` 会继续偏向 telemetry，`tooling_gap` 会抬高 knowledge 并压低 SSH，避免空转重试
- [x] 当自动候选已耗尽且 blocker 已给出最小必要材料时，规则规划会直接产出结构化 `request_evidence`，而不是只落一条泛化 blocker 文案
- [x] `reflect` 已能识别 `403/401/forbidden/权限不足` 等权限阻塞，并归类为 `permission_blocked`
- [x] `planWithLLM` 已开始复用 blocker-aware `candidateChain`，LLM 规划不再脱离规则规划的换路排序单独漂移
- [x] 主线程 answer prompt 已提升"用户原始材料"优先级：在汇总时单独透出 `[主线程用户材料]`，并明确要求先用用户材料约束结论边界
- [x] 用户材料已开始映射为显式"验证重点"：如 `observation_truth / query_correctness / runtime_failure / config_state / telemetry_correlation`，planner 不再只把材料当作浅层关键词
- [x] `subgoal / taskThread` 已开始携带正式 `validationIntent` 字段，验证目标不再只是 entity hint 临时推断
- [x] 子线程执行态已开始跨轮累计，不再只依赖单轮结果判断 pending / guidance / evidence / answered
- [x] 主线程可收口判定已接入 reflect：子线程证据齐备但主线程仍为弱结论时，不再提前 done
- [x] 多子线程场景下 answer 已自动附带主线程汇总结构合同，默认要求输出"当前轮已确认事实 / 未确认假设 / 建议动作 / 待验证项"
- [x] answer 阶段已开始按 `threadId` 聚焦当前子线程目标，避免直接把整轮复合问题重新塞回单个子线程 prompt
- [x] 已把 `eval/corpus.json` 的 15 个主线 case 与 playbook 命中关系固化到本地覆盖回归
- [x] 已将主线 case 到 `scenario / playbookId` 的覆盖映射外置到 `eval/playbook-coverage-map.json`
- [x] 已新增一致性回归，校验 `corpus / coverage map / playbook 数据` 三层同步
- [x] 已新增 `npm run verify:playbook-coverage`，把主线 case 覆盖校验收敛成独立本地验收入口
- [x] 已将 Playbook Coverage 校验接入 `make verify-local` 的离线阶段，并新增 `make verify-playbook-coverage`
- [x] 已将 `PLAYBOOK-COVERAGE-VERIFY-*.MD` 纳入 `verify-prune` 与仓库验收规范的滚动清理
- [x] tool-first playbook 已开始支持 step 级 `toolBindings`，当前 step 可显式声明候选工具、参数与回退顺序
- [x] `toolRouting` 兼容字段已开始由首个 `tool` step 自动推导，`DataID` 与 `火影忍者查询无数据` 场景已去掉 profile 级重复配置
- [x] 已新增 `getScenarioToolRouting` 共享 helper，planner 与 `/api/chat` metadata 开始共用同一套工具路由回退逻辑
- [x] 文件化 playbook 中的 tool-first 场景已去掉 `allowedToolNames` 旧字段，并新增回归防止 profile 级 `toolRouting` / step 级 `allowedToolNames` 回流到 JSON
- [x] 运行时实例化已开始把 legacy `allowedToolNames + toolParams` 自动归一成 `toolBindings`，planner 与工具路由推导继续减少对旧字段的直接依赖
- [x] `summarizePlaybook` 对外已不再暴露 `allowedToolNames`，`/api/chat` metadata 中的 playbook 摘要统一收敛到 `toolBindings`
- [x] `/api/chat` metadata 中的 `toolRouting` 已开始附带 `toolRoutingSource`，可区分当前路由来自 step 还是 profile 兼容字段
- [x] `/api/chat` metadata 中的 `intentDecision` 已开始附带 `toolPlan`，当前工具步骤摘要可直接从 playbook step 数据读取
- [x] `/api/chat` metadata 中的 `toolRouting` 当前已只在 `profile_compat` 时暴露，step / playbook_step 路由统一通过 `toolPlan` 呈现
- [x] planner 已开始只在 `toolRoutingSource=profile_compat` 时回退到旧 `toolRouting`，`playbook_step` 级路由不再反向喂回核心执行链路
- [x] tool-first 场景实例化已不再把派生 `toolRouting` 自动写回 profile，兼容工具路由开始收敛到 helper / metadata 视图
- [x] `plan` 取工具列表的时机已调整到 `context-preparer` 回填 `roleIds` 之后，角色回填现在会真实影响本轮工具候选
- [x] `request_evidence` 回复已开始优先按当前 step 的 `requiredEvidence` 渲染
- [x] 非排障消息会清理残留 `playbookProgress`，降低工作记忆污染
- [x] `answer` step 已开始使用 `outputSections / mustIncludeKeywords` 数据自动生成回答约束
- [x] `reflect` 已开始校验 answer 是否满足 section / keyword 约束
- [x] `reflect` 已开始按文件化 `conclusionSchema` 校验最小结论结构，覆盖 `evidence_request_v1 / diagnosis_v1 / info_summary_v1`
- [x] 已明确冻结约束：当前 matcher / loader 仅为过渡态，长期目标是 playbook 数据化，避免新增 case 持续 hardcode
- [x] 已将场景文件加载、结构校验、模板实例化与启发式匹配从 `troubleshooting-scenarios.ts` 拆到独立 loader / matcher 服务

## 已完成（P7 本轮 2026-03-06）

- [x] [P7-0-1] Admin "系统设置"菜单不渲染 | sidebar CSS 修复 | 验收：浏览器 E2E
- [x] [P7-0-2] Admin 可观测性面板数据全空 | catch 兜底 + 前端 fallback | 验收：浏览器 E2E
- [x] [P7-1-1] 学习闭环定时调度 | lifecycle-modules interval 6h | 验收：任务面板
- [x] [P7-1-2] ChatOps 意图回归矩阵 CI 卡点 | verify-local chatops_guard | 验收：21/21
- [x] [P7-2-1] Orchestrator 拆分 | 2791 行 → core+analyzer+modes | 验收：94/94 测试
- [x] [P7-2-2] 短期记忆实现对齐设计 | TECHNICAL-DESIGN.MD 更新 | 验收：落地率 5/5=100%
- [x] [P6-5] Node.js 20 升级 | Dockerfile + engines + 文档 | 验收：tsc 通过 + 远端部署
- [x] [P6-6] 静态页面对齐 | 版本号/亮点数/双系统/企微/CSS | 验收：15 页审计
- [x] main.ts 拆分 | 1189 行 → 317 行 + chat/wechat/pages 路由 | 验收：175 测试
- [x] 测试修复 | dual-system(7) + loop(2) LLM 环境依赖 | 验收：640 全绿
- [x] ESLint 配置 + lint 修复 | .eslintrc.json + 8 errors → 0 | 验收：TSC+ESLint 双零
- [x] 双系统快速模式扩展 + 路由埋点 | 日期/星期查询走系统1，新增 `agent_plan_routing_total` 指标 | 验收：全量 641 测试
- [x] context-preparer 接入 Plan | 轻量/完整上下文按需准备，roleIds 自动回填，新增 `prepared_context` observation | 验收：全量 642 测试
- [x] prepared_context 参与 fast path 判定 | 仅在完整上下文检测到明显会话/知识依赖时抑制系统1，回退系统2 | 验收：全量 644 测试
- [x] ESLint warnings 清零 | 15 个文件机械清理未使用导入/参数/变量 | 验收：ESLint 0 errors / 0 warnings + 全量 642 测试
- [x] lint 脚本降噪 | `package.json` 中为 ESLint glob 加引号，消除 ignore 文件 warning 噪音 | 验收：`yarn lint` 静默通过

## 已完成（P6 本轮 2026-03-05 ~ 2026-03-06）

- [x] [P6-OPAR] OPAR observe 记忆注入修复
- [x] [P6-CHATOPS-LLM] ChatOps LLM 主路径改造
- [x] [P6-DOCS] 设计文档对齐实际实现
- [x] [P6-CHATOPS-UI] ChatOps 交互体验重设计

## 已完成（P3–P5 里程碑）

- [x] [P3] 自动学习闭环 + 统一执行器治理 + Agent Loop 内核 + 任务调度 + 可观测平台 | 2026-02-26
- [x] [P4] LLM 接入 + 指标埋点 + 工具链路增强 + 远端部署 | 2026-02-26~27
- [x] [P5] Agent 知识增强回答 + Learning Loop 闭环 | 2026-02-26
- [x] [P6-0] ChatOps Agent 化（OPAR + AdminExpert） | 2026-02-27

## 已完成（I0–I3 基线迭代）

- [x] [I0] 工具链与验收基线（验收入口 + 安全收口 + 报告模板） | 2026-02-25
- [x] [I1] ChatOps 管理入口（解析增强 + 闭环收口 + 配置加密 + 错误模型） | 2026-02-25
- [x] [I2] 连续对话能力（场景库 + 三层记忆复验 + 对话体验收敛） | 2026-02-25
- [x] [I3] 全链路验收（三入口一致性 + 稳定性治理 + 全量回归） | 2026-02-25

## 已完成（历史里程碑）

- [x] ChatOps AdminAction 一期闭环 | 2026-02-12
- [x] 管理模型简化 + MCP 凭据加密 | 2026-02-13
- [x] 三层记忆闭环远程复验 | 2026-02-12
- [x] 角色-工具权限体系 + 执行器接入 | 2026-02-10~11
- [x] 核心路由测试补齐 | 2026-02-11
