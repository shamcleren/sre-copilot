# 更新日志 (Changelog)

## [未发布] - 2026-03-16

### 📚 Knowledge Adapter 设计规格（2026-03-31）

- **新增规格**: 新增 `docs/superpowers/specs/2026-03-31-KNOWLEDGE-ADAPTER-DESIGN.MD`，固定本轮 `knowledge` adapter 的最小增量设计：仅接通 `search_knowledge / mcp_search_knowledge`，保持 `V2 runtime` 主流程不变，并把真实执行结果纳入现有 `toolExecutions / evidence / blocker / conclusion / regression` 闭环。
- **边界明确**: 本轮设计明确 `adapter_unavailable` 只属于占位 adapter；真实 `knowledge` adapter 失败时应统一映射到 `tool_timeout / authentication_failed / permission_denied / tool_error`，不再输出“尚未接通 adapter”的误导性语义。
- **文档对齐**: `docs/DOCS-INDEX.MD` 已补充该规格入口，便于后续直接从 `Superpowers / 规格` 进入本轮设计文档。

### 🧭 Workflow Orchestrator 落地（2026-03-31）

- **新增实现**: 新增 `v2/eval/workflow/` 下的 `types.ts`、`source-snapshot.ts`、`detector.ts`、`actions.ts`、`presenter.ts` 与 `v2/eval/runners/workflow.ts`，正式落地 workflow 状态合同、共享源快照、状态判定、动作映射、状态写盘与 CLI 输出。
- **新增测试**: 新增 `v2/tests/workflow-detector.test.ts` 与 `v2/tests/workflow-runner.test.ts`，固定状态优先级、dirty 分类、动作映射、状态写盘与输出格式；当前新增 13 个测试已通过，并补齐“同一批 docs dirty 已 handoff”与“mixed dirty 已 verify + handoff 后不回退”的回归用例。
- **共享逻辑收口**: `v2/eval/runners/project-context-status.ts` 已改为复用 workflow `source-snapshot` 的 Git/TODO/dirty 读取逻辑，避免 handoff 与 workflow 各维护一套分类规则。
- **命令面接通**: 根 `package.json` 新增 `workflow` / `workflow:resume` / `workflow:check` / `workflow:verify` / `workflow:refresh` / `workflow:handoff`；`Makefile` 同步新增 `make workflow-*` 包装入口。
- **文档对齐**: `README.MD`、`LOCAL-DEV-GUIDE.MD`、`docs/verification/HANDOFF-PROTOCOL.MD`、`docs/verification/VERIFICATION.MD` 与 `docs/DOCS-INDEX.MD` 已统一为“`workflow:*` 为默认入口，`runtime:*` 为底层能力，handoff/readiness 为派生视图”的口径；日常开发建议现也已明确切到 `workflow:resume -> workflow:verify -> workflow:handoff`。
- **生成器收口**: `v2/eval/runners/project-context-status.ts` 现已导出 `buildSessionResume` / `buildContextMarkdown` / `buildHandoffMarkdown`，并把 session resume、readiness 上下文与 handoff 快照中的推荐命令统一切到 `workflow:*`；新增 `v2/tests/project-context-status.test.ts` 3 个回归测试锁定该口径。
- **公开入口扫尾**: `README.MD`、`LOCAL-DEV-GUIDE.MD`、`docs/verification/VERIFICATION.MD`、`docs/DOCS-INDEX.MD`、`docs/tools/CLI-REFERENCE.MD` 与根 `Dockerfile` 进一步收口到 `workflow:*` 主入口，移除对 `runtime:verify:core` / `runtime:status` / `runtime:handoff` 的继续公开推荐。

### 🔌 P12 V2 运行时拆桥（2026-03-26）

- **技术债清理**: 删除 5 个僵尸脚本（`run-local.sh`、`start-local.sh`、`init-db.sh`、`verify-v2-compat.sh`、`check-chatops-coverage.sh`）；修复 `verify-copilot-diagnosis` Makefile target 引用错误文件名；`verify-v2-full`/`verify-v2-regression` 不再调用已删除的 compat gate
- **依赖清理**: 从根 `package.json` 移除 `jest`、`ts-jest`、`@types/jest`、`fastify`（v1 时代遗留，8→4 个 devDependencies 减半）
- **prune 补齐**: `AGENTS.MD` 和 `verify-prune.sh` 补充 `ONLINE-VERIFY-*.MD`（保留 5 份）和 `LLM-CROSS-BENCHMARK-*`（保留 3 份）滚动策略；一次性清理 19 个超限 ONLINE-VERIFY 报告
- **端口统一**: `nginx-local.conf` upstream 从 3000→3001；`config.example.sh` API_PORT 从 3000→3001；`restore-from-values.sh` 过时的多 deployment 重启提示已更新
- **一致性修复**: `README.MD` 已重写为当前纯 `V2` runtime / eval / handoff / remote deploy 口径；HTTP 示例统一到 `127.0.0.1:3001`，并明确仓库不再自带本地 HTTP 服务主链
- **部署脚本修复**: `scripts/deploy/deploy-remote.sh` 不再依赖已删除的 `k8s/` 清单，改为直接更新现有 `deployment/sre-copilot-app` 镜像并在容器内执行 `3001/health` 检查；远端 `secrets.env` 读取路径同步修正
- **配置恢复修复**: `config/restore-from-values.sh` 与 `config/README.MD` 统一输出到 `config/restored/`，不再引用不存在的 `k8s/mvp/` 目录
- **状态页口径收敛**: `readiness-status.ts`、`project-context-status.ts`、`HANDOFF-PROTOCOL.MD`、`V2-READINESS-CHECKLIST.MD` 已统一为 `core + compare 观察层` 口径，并重新生成最新 `V2-READINESS-STATUS.MD` / `HANDOFF-LATEST.MD`
- **锁文件同步**: 重新生成 `package-lock.json`，移除已从 `package.json` 删除的 `jest` / `ts-jest` / `@types/jest` / `fastify` 漂移项
- **文档扫尾**: 重写 `DEPLOYMENT-GUIDE.MD`、`docs/wecom/WECOM-BOT-GUIDE.MD`、`docs/tools/MCP-EXECUTOR.MD`、`docs/tools/MY-TOOLS-COMMAND.MD` 与 `docs/tools/CLI-REFERENCE.MD`，统一到当前 `V2 + compare 观察层 + 3001 + 远端部署` 口径；`DOCS-INDEX.MD`、`MULTI-ENTRY-TEST-RUNBOOK.MD`、`VERIFICATION.MD` 与多份 design 文档的主入口表述也已去掉已归档 `srectl` / `v1` 执行路径
- **入口诚实性修复**: `eval/run-eval.sh` 现仅保留 corpus 预览（`--dry-run`）并明确提示迁移到 `runtime:verify:core / runtime:compare / runtime:status / runtime:handoff`；`scripts/test/report-v2-readiness.sh`、`readiness-status.ts`、`project-context-status.ts` 与自动生成的 `V2-READINESS-STATUS.MD` / `HANDOFF-LATEST.MD` 已统一为 `compare` 观察层口径，`full verify` 恢复与当前 core gate 一致；`README.MD` 与 `docs/verification/VERIFICATION.MD` 同步移除了对 `verify-playbook-coverage` 和旧 CLI 执行链的继续推荐
- **本地验收入口收口**: `Makefile` 的 `help` / `verify-local*` / `test-all-report` 已改为“已运行服务实例”口径，`test-all-report` 不再自动执行 `local-up-bg`；`LOCAL-DEV-GUIDE.MD` 与 `scripts/tools/CODEX-REMOTE-OPS.SH` 也补充了 `local-up-bg / local-restart-bg` 仅为兼容型实例维护脚本的说明；`README.MD` / `CLI-REFERENCE.MD` / `CURRENT-IMPLEMENTATION-MAP.MD` / `DOCS-INDEX.MD` / `MULTI-ENTRY-TEST-RUNBOOK.MD` 的旧 `runtime-context-status`、`verify-playbook-coverage`、`CLI` 主流程曝光已同步收口；`TODO.MD`、`TECHNICAL-DESIGN.MD`、`CODEX-REMOTE-OPS.MD`、`SSH-REMOTE-MANAGEMENT-TOOL.MD`、`TOOLS-DESIGN.MD`、`TOOL-COVERAGE-INVENTORY.MD`、`MCP-CURSOR-VS-SRE-COPILOT.MD`、`MAINCHAIN-ACCEPTANCE-MATRIX.MD` 与 `CHATOPS-INTENT-DESIGN.MD` 也已补齐“历史快照 vs 当前实现”边界说明

- **重构**: `v2/src/adapters/unify-query.ts` 不再直接 import `v1/src/services/tools/unify-query` 与 `ToolContext`；`V2` 现改为通过新增的 `v2/src/adapters/unify-query-client.ts` 直接构造 UnifyQuery API 请求
- **调整**: `v1/src/services/v2-chat-router.ts` 现会在调用 `V2` 前预加载系统级 `unify_query` 配置，并通过 `adapterContext.unifyQueryConfig` 以纯数据方式透传给 `V2` adapter，切断 `V2 -> V1` 的该条直接源码依赖
- **重构**: `v2/src/observability/legacy-v1-observability.ts` 已改为使用 `v2/src/observability/database.ts` 与本地只读 SQL 聚合实现；`runtime:status` / readiness 生成不再 import `V1` 的数据库、token、LLM、tool、route runtime 统计模块
- **公共层**: 仓库根已补齐 `pg` / `@types/pg` / `dotenv`，为 `V2` 独立 observability 读链提供公共依赖
- **验证**: 本地 `npm run v2:test`、`npm run v2:test:route-regression`、`npm --prefix v1 run build` 与 `npm run runtime:status` 已通过；当前 `v2/` 目录已无 `v1/src/*` 直接 import
- **收口**: 已新增仓库根 `compat/chat-routes.ts` 与 `compat/v2-chat-router.ts` facade，`tests/compat/*.ts` 不再直接 import `v1/src/routes/chat` / `v1/src/services/v2-chat-router`；同时 `tests/compat/tsconfig.json` 已切到独立 TS 基线
- **调整**: `scripts/test/report-v2-readiness.sh` 现默认只执行 core gate；compat/compare 改为按需通过 `RUN_V2_COMPAT_VERIFY=1` 或 `npm run runtime:verify:compat` 补跑，`v2/eval/runners/readiness-status.ts` 也已支持在缺少最新 compare 报告时继续生成 readiness / handoff 状态页
- **收口**: `tests/compat/*.ts` 现已不再直接 `jest.mock('../../v1/src/...')`；新增 `compat/chat-route-deps.ts`、`compat/v2-chat-router-deps.ts` 与 `compat/date-deps.ts`，并通过 `scripts/test/jest.v2-compat.config.cjs` 的 `moduleNameMapper` 将 compat route regression 收敛到稳定依赖入口
- **调整**: 已新增 `eval/effect-tuning-shared-baseline.json` 作为共享 replay baseline 主入口；`scripts/test/test-effect-tuning-replay.js`、`v2/eval/runners/compare-v1-v2.ts` 与 `v2/scripts/migrate-v1-replay-cases.ts` 默认改读该文件，根脚本新增 `replay:baseline` / `replay:baseline:gate`，旧 `v1:replay*` 改为兼容别名
- **收口**: replay 脚本输出报告名已从 `EFFECT-TUNING-REPLAY-*` 改为 `BASELINE-REPLAY-*`；`compare-v1-v2.ts` 同时兼容新旧报告名匹配；`prune-workspace-artifacts.sh` 同步适配；`compare-v1-v2.ts` 内部类型/变量 `V1Report` / `v1ReportPath` 保留作为对比身份标识
- **删除**: ✅ `v1/` 目录已物理删除（256 个文件）；同时删除 `compat/`（5 个桥接文件）、`tests/compat/`（2 个 route regression 测试）与 `scripts/test/jest.v2-compat.config.cjs`
- **清理**: 根 `package.json` 删除全部 `v1:*` 脚本与 `v2:test:route-regression` / `runtime:verify:compat` / `v2:verify:compat`；`Makefile` 中 `build`、`docker-build`、`local-up-bg`、`local-db-reset`、`test-no-llm`、`v2-seed-runtime-sample`、`test-embedding`、`verify-m1-*`、`verify-playbook-coverage` 等 target 已去掉 `cd $(ROOT)v1` 依赖或改为占位提示
- **清理**: `.gitignore` 删除 `v1/logs/`、`/v1/coverage/`、`v1/k8s/secrets.env`、`!v1/k8s/secret.yaml`、`v1/.env` 等条目；`prune-workspace-artifacts.sh` 删除 `v1/dist`、`v1/coverage` 清理项
- **清理**: `v2/eval/runners/project-context-status.ts` 删除 `v1/` dirty 文件检测与 `v1 保留为 oracle` 架构描述
- **文档**: `DEPLOYMENT-GUIDE.MD`、`CURRENT-IMPLEMENTATION-MAP.MD`、`TECHNICAL-DESIGN.MD`、`SRE-COPILOT-V2-HARNESS-FIRST-DESIGN.MD`、`TOOL-COVERAGE-INVENTORY.MD` 顶部加弃用标注；`README.MD` 目录分层与项目结构树已更新为纯 V2；`LOCAL-DEV-GUIDE.MD`、`WECOM-BOT-GUIDE.MD`、`SECRET-MANAGEMENT.MD` 中 `v1/` 路径引用已全部更新
- **里程碑**: ✅ **P11 V2 替换 V1 迁移路线全部完成** — `v1/` 物理删除、代码/脚本/文档全面清理、`v2:test` 15/15 全绿
- **评估**: P10 缓存策略评估完成 — 结论：不引入 subprocess cache。V2 纯函数阶段 <2ms 无缓存必要；工具执行（占 99%+ 延迟）返回实时遥测数据不可缓存；SRE 排障查询天然唯一性高预估命中率 <5%
- **清理**: `eval/reports/` 从 78 个历史报告清理到 10 个（保留最新 3/5/2 份）；`v2/eval/reports/` 从 181 个清理到 19 个（保留最新 5 份 COMPARE/READINESS）
- **修复**: Makefile 中 7 处残留 v1 路径硬引用已全部修正（`docker-build`、`local-restart-bg`、`v2-seed-runtime-sample`、`test-embedding`、`verify-m1-chatops-mcp`、`verify-playbook-coverage`、`verify-effect-tuning-gate`）
- **新增**: 根目录 `Dockerfile`（替代已删除的 `v1/Dockerfile`），基于 `node:20-alpine` + `tsx` 运行 V2 runtime

### 🤝 Handoff 机制固化（2026-03-25）

- **新增**: `docs/verification/HANDOFF-PROTOCOL.MD`，把跨 session 续接的固定产物、刷新时机、推荐顺序与接手步骤制度化
- **增强**: `v2/eval/runners/project-context-status.ts` 现会额外生成 `docs/verification/HANDOFF-LATEST.MD`，提供最新人类可读交接快照，并在缺少 `READINESS-*.json` 时自动降级生成最小可续接现场
- **对齐**: `README.MD`、`LOCAL-DEV-GUIDE.MD`、`docs/verification/VERIFICATION.MD` 与 `docs/DOCS-INDEX.MD` 已同步 handoff 入口与产物说明，后续统一以 `runtime:handoff` + `HANDOFF-LATEST.MD` 作为开发接力主入口
- **清理**: `docs/verification/PROGRESS-REPORT.MD` 与 `docs/verification/LIVE-RUN-STATUS.MD` 已转入 `docs/verification/ARCHIVE/`，主索引、路线图与评估文档不再把它们作为现行入口

### 🧹 P12 `v1/` 下线执行清单（2026-03-25）

- **新增**: `TODO.MD` 现已把“`V2` 替换主入口”和“`v1/` 可物理删除”之间的差距展开为可执行清单，明确要求先去掉 `V2 -> V1` 运行时 import、compat 测试依赖、跨版本 oracle/replay 耦合、开发/部署工具链入口与线上 fallback 语义
- **明确**: 当前 `v1/` 仍未达到可删除状态；`unify-query bridge`、`legacy-v1-observability`、`tests/compat/*`、`compare-v1-v2` 链路以及根级 `v1:*` / `v1/Dockerfile` 工具入口，均已被列为物理删除前必须先收口的阻塞项
- **约束**: `v1/` 的最终物理删除判据已固定为四条同时满足：运行时无 `v1/src/*` import、测试不再依赖 `v1`、发布 gate 不再要求 `V1` oracle、线上无 `V1` fallback

### 📡 P10 线上 V2 route runtime 复测入口（2026-03-25）

- **新增**: `v1/src/routes/admin.ts` 已补 `GET /api/admin/chat-route-runtime/summary`，可直接查询显式 `V2` 主入口在给定时间窗口内的 `handled / fallback / intentInferMs / v2RouteMs / mode` 汇总
- **增强**: `scripts/test/test-expert-diagnosis-entry.js` 现支持 `CHAT_ROUTE / EXPECT_ROUTE / REQUIRE_NO_FALLBACK / REQUIRE_V2_RUNTIME / VERIFY_ROUTE_RUNTIME_SUMMARY`，会把 `routeMetadata / phaseTimings / v2RuntimeObservability` 与 route runtime 汇总一起纳入结构化报告
- **增强**: `scripts/test/verify-online-regression.sh` 已将“专家排障入口回归”收紧为显式 `V2` + 无 fallback + route runtime summary 复测，并把默认 `REMOTE_PATH` 修正为 `/data/sre-copilot`，便于真实线上窗口直接判断 `V2` 是否稳定承接主入口
- **验证**: `npm --prefix v1 test -- --runInBand src/routes/__tests__/admin.test.ts`、`node --check scripts/test/test-expert-diagnosis-entry.js` 与 `bash -n scripts/test/verify-online-regression.sh` 已通过
- **修复**: 远端部署构建已切换为仓库根 context（`docker build -f v1/Dockerfile .`），`v1/Dockerfile` 现保留 `v1/` 与 `v2/` 目录层级进行编译，并将运行入口对齐到 `dist/v1/src/main.js`；同时移除了生产容器对 `tsconfig-paths/register` 的预加载依赖，避免新镜像启动即崩溃
- **修复**: `scripts/deploy/deploy-remote.sh` 合并 `.env.secrets` 到远端 Secret 时，现默认跳过 `POSTGRES_*` 与 `DATABASE_URL`，避免本地数据库凭据覆盖远端持久化 PostgreSQL 口令，导致应用健康检查长期显示 `database=unavailable`
- **修复**: `v1/src/routes/chat.ts`、`v1/src/services/v2-chat-router.ts` 与 `scripts/test/test-effect-tuning-replay.js` 已打通 replay `context` 透传；显式 Pod 场景的 `buildV2ToolRequests(...)` 现会先生成 `query_relation_multi_resource` 再补 `query_metrics`，避免 `ET-C1` 丢失业务上下文、`ET-D1` 误以 `unify_query` 作为首跳
- **修复**: `scripts/test/test-effect-tuning-replay.js` 现会在每个 case 前自动 `/new` 重置会话，并消费 `v2RuntimeObservability.selectedToolClasses` 与 `缺失材料/先补材料` 文案信号；本地 `npm run v1:replay:gate` 已恢复为 `6/6 PASS`
- **修复**: `Makefile` 与 `scripts/tools/CODEX-REMOTE-OPS.SH` 的默认远端项目路径已统一修正为 `/data/sre-copilot`，避免 `make verify-online` / 远端运维入口继续误指向旧目录 `/data/workspace/sre-copilot`

### 🤝 P12 V1 退场门槛与 handoff 升级（2026-03-24）

- **新增**: `TODO.MD` 已新增 `P12 V1 退场与开发接力（handoff）`，把“`V2` 已替换主入口”和“`V1` 可物理删除”正式拆成两个阶段，补齐去 oracle / 去 rollback / 去 tooling 依赖的独立路线
- **增强**: `v2/eval/runners/project-context-status.ts` 现会把当前重点、活跃未完成项、脏文件热点、建议验证命令与 handoff prompt 一并写入 `PROJECT-CONTEXT-LATEST.json`，并同步更新 `V2-READINESS-STATUS.MD` 的工程级上下文段落
- **增强**: 根 `package.json` 新增 `npm run runtime:handoff` / `npm run v2:handoff` 显式入口，`README.MD` 与 `docs/verification/VERIFICATION.MD` 已同步说明 handoff 作为多轮 session 接力入口的口径
- **推进**: 仓库根目录现已补齐 `tsx / typescript / jest / ts-jest / fastify` runtime + compat tooling；`runtime:handoff / context / test / smoke / replay / compare / compat route regression` 与 `v2:status` 的执行链均已切离 `v1/node_modules`，仅保留对 `v1/` 源码与 oracle 语义的依赖
- **推进**: 根目录已补齐 `@types/node`，`v2/tsconfig.json` 不再硬编码 `../v1/node_modules/@types`；同时新增 `verify-v2-core.sh` / `verify-v2-compat.sh` 与 `runtime:verify:core` / `runtime:verify:compat`，把纯 `V2` runtime gate 与跨版本 compat gate 正式拆开
- **推进**: `runtime:status` / `v2:status` 已改为以纯 `V2 baseline` 生成 readiness 结论：`compat / V1 compare` 继续保留为跨版本 oracle 观察项，不再因 compat 失败阻断状态页与 handoff 产出；同时 `V2` 对 `V1` 运行态模块的直接引用已收拢到 `v2/src/observability/legacy-v1-observability.ts`
- **推进**: `runtime:verify` 已回到纯 `V2` core gate 语义，显式 full verify 入口改为 `runtime:verify:full` / `v2:verify:full`；`v2:verify` 与 `verify-v2-regression.sh` 继续作为兼容别名保留旧 full gate
- **推进**: `verify-v2-compat.sh` 已进一步切到根目录 `npm run v2:test:route-regression` + `scripts/test/jest.v2-compat.config.cjs`；compat route regression 测试文件现已迁到仓库根 `tests/compat/`，`v1` 侧只保留脚本代理，剩余耦合主要收敛到 `v1` 源码导入与 runtime 依赖

### 🪶 P10 专家意图识别轻量记忆（2026-03-24）

- **优化**: `v1/src/routes/chat.ts` 现已为专家对话主入口的 `inferIntentWithMemory(...)` 显式收紧记忆预算，统一改为 `historyTokenBudget=320`，并跳过 `roles` 查询与长期记忆注入，避免进入 `V2` 或回退 `V1` 前先拼接重上下文
- **范围**: 非流式 `/api/chat` 与流式 `/api/chat/stream` 两条主入口已统一复用同一套轻量配置；`V1` fallback 仍保留后续 `buildCompressedContext + runAgentLoop` 的完整排障上下文，不改变最终诊断链路
- **验证**: 当前对应回归已由 `tests/compat/chat-v2-route.test.ts` 承接非流式/SSE 调用断言；迁移后根入口 `npm run v2:test:route-regression` 与 `npm --prefix v1 run build` 已通过

### ✂️ P10 回答阶段 Prompt 瘦身（2026-03-24）

- **优化**: `v1/src/agent/act.ts` 已为回答阶段增加分段上下文预算与 guidance 压缩，不再把 `entity / threadEvidence / priorTool / knowledge` 无上限拼接进单次 `replyGeneration` prompt
- **策略**: 优先保留当前线程实体线索、子线程证据摘要与本轮工具结果；上一轮工具上下文与长期记忆改为按总量预算截断，避免回答阶段 prompt 虚胖拖慢真实链路
- **验证**: `v1/src/agent/__tests__/loop.test.ts` 已新增“裁剪上轮上下文”和“裁剪长期记忆上下文”回归；本地 `npm --prefix v1 test -- --runInBand src/agent/__tests__/loop.test.ts` 与 `npm --prefix v1 run build` 已通过

### 🚦 P10 phase-aware 模型分流（2026-03-24）

- **增强**: `v1/src/services/llm.ts` 已按阶段解析 `bk_ai` 模型：`task-analysis`（意图识别）与 `tool_planning`（工具规划）默认优先走快模型，不再与主回复阶段共用默认重模型
- **增强**: `v1/src/config/index.ts` 与 `v1/src/types/index.ts` 已补充 `BK_INTENT_LLM_MODEL`、`BK_TOOL_PLANNING_LLM_MODEL`，允许在不改代码的前提下单独覆写两段模型
- **验证**: `v1/src/services/__tests__/llm.test.ts` 已新增运行态摘要与真实工具规划请求回归，确认 `toolPlanning` 实际请求体会下沉到快模型；本地 `npm --prefix v1 run build`、`npm --prefix v1 test -- --runInBand src/services/__tests__/llm.test.ts`、`npm run v2:status` 均通过
- **对齐**: `TODO.MD` 已同步勾掉 `P10` 中“按任务类型做模型分流”项

### ⏱️ P10 agentLoop 子阶段拆账（2026-03-24）

- **增强**: `v1/src/agent/loop.ts` 现为每轮 cycle 记录 `observe / plan / act / reflect` 耗时，并额外聚合 `toolExecutionMs / replyGenerationMs`
- **增强**: `v1/src/agent/act.ts` 已为 `answer / request_evidence / playbook_response` 回写 `durationMs`，不再只有工具调用有耗时信息
- **增强**: `v1/src/routes/chat.ts` 已把上述子阶段汇总并入 `metadata.phaseTimings` 与 `agentRuntimeObservability.phaseTimings`，非流式与流式主入口口径一致，同时补齐对应 Prometheus 指标
- **验证**: 本地 `npm run v2:status` 已通过，`chat-v2-route` / `v2-chat-router` / runtime regression / readiness 仍保持全绿

### 📊 P10 三段统一性能观测（2026-03-24）

- **增强**: `v2/eval/runners/readiness-status.ts` 已把 `intentInference / toolPlanning / replyGeneration` 的 phase 视图扩成统一口径，汇总请求数、成功/失败、平均/峰值耗时、`prompt/completion/total tokens`、`system/user prompt chars` 与 `Top Model`
- **增强**: `docs/verification/V2-READINESS-STATUS.MD` 现会直接给出“全局 LLM 最慢阶段 / 最大 Prompt 阶段”摘要，不再只展示偏薄的 phase 表
- **验证**: 本地 `npm run v2:test` 与 `npm run v2:status` 已通过，`V2` readiness 仍保持“验收通过”
- **对齐**: `TODO.MD` 已同步勾掉 `P10` 中“三段统一观测”项，后续性能优化可直接基于新 phase 视图推进

### 🧭 V2 service_locator 与验证优先级收口（2026-03-24）

- **增强**: `v2/src/contracts/runtime.ts`、`model-turn.ts` 与 `troubleshooting.playbook.ts` 现已显式收口 `targetResolutionSource / validationFocus`，区分“已拿到显式对象”“只有业务上下文待解析归属”“当前先验证查询正确性/现象真实性”等不同进入链路方式
- **增强**: `telemetry-first.policy.ts` 与 `execute-case.ts` 现会按上述合同决定首跳：业务上下文服务状态先走 `relation` 解析归属，`没数据 / 掉零` 等场景仍优先 `unify_query` 证伪，再决定是否补做关系串联
- **增强**: `build-conclusion.ts` 不再泛化表述，已能明确回答当前是在“先解析归属 service”还是“先证伪现象 / 查询正确性”
- **验证**: `v2/tests/runtime-regression.test.ts` 已新增业务上下文归属解析与“先证伪再下钻”回归；本地 `npm run v2:test` 当前 13/13 通过
- **对齐**: `TODO.MD` 已同步勾掉 `P9` 下 `service_locator` 与验证优先级两项待办

### 🎯 效果调优最小发布守门集（2026-03-24）

- **新增**: `eval/effect-tuning-release-gate.json`，从全量 `effect-tuning` 回放集中固化 `ET-A1 / ET-A2 / ET-B1 / ET-C1 / ET-D1 / ET-E1` 六个代表 case，覆盖 A/B/C/D/E 五类与四个主链分支
- **新增**: 根 `package.json` 已补 `npm run v1:replay:gate`，`Makefile` 已补 `make verify-effect-tuning-gate`，支持单独执行最小发布守门集
- **增强**: `scripts/test/verify-online-regression.sh` 现已把 effect-tuning 最小回放守门接入统一远端验收，发布前默认校验专家排障入口 + A/B/C/D/E 代表场景
- **对齐**: `TODO.MD`、`README.MD`、`docs/verification/VERIFICATION.MD` 与 `docs/verification/MAINCHAIN-ACCEPTANCE-MATRIX.MD` 已同步更新 effect-tuning 发布守门与主链矩阵口径

### ✅ 服务状态正向命中守门（2026-03-23）

- **增强**: `v2/tests/runtime-regression.test.ts` 已新增 `ET-A2 / ET-A3 / ET-A4` 正向回归，固定“显式服务名 / Pod 名 / 域名”三类输入必须继续实时排查，不得回退为补材料
- **增强**: 当前对应回归已由 `tests/compat/v2-chat-router.test.ts` 承接服务名 / Pod / 域名三类 `buildV2ToolRequests(...)` 断言，确保主入口首跳 telemetry 查询种子正确生成
- **对齐**: `TODO.MD` 已同步勾掉“我的服务情况正向命中链路验收”项，当前主链守门口径与待办状态一致

### 🧭 工程级上下文续接机制（2026-03-23）

- **新增**: `v2/eval/runners/project-context-status.ts`，统一生成跨 session 可读的工程级上下文快照，汇总北极星目标、架构不变量、Source of Truth、Git 现场、阻塞与下一步最短路径
- **新增**: 根 `package.json` 与 `Makefile` 已补 `runtime:context` / `v2:context` / `runtime-context-status` / `v2-context-status` 入口，支持单独刷新上下文而不重跑完整 verify
- **增强**: `scripts/test/report-v2-readiness.sh` 现在会在刷新 readiness 后同步刷新 `PROJECT-CONTEXT-LATEST.json`，并把 session 续接段落注入 `docs/verification/V2-READINESS-STATUS.MD`
- **增强**: 工程级上下文快照会忽略 `.codebuddy/` 本地记忆噪音，并自动滚动保留最近 5 份 `PROJECT-CONTEXT-*.json` 历史快照
- **对齐**: `README.MD`、`docs/verification/VERIFICATION.MD`、`docs/verification/V2-READINESS-CHECKLIST.MD` 与 `docs/DOCS-INDEX.MD` 已同步补齐上下文续接入口与产物口径

### 🧹 仓库清理与残留收口（2026-03-20）

- **清理**: 删除已确认废弃的迁移残留与历史产物，包括根 `e2e/screenshots/` 旧截图、`cursor-plugin/` 空骨架、`.playwright/`、`.tmp/`、若干空目录以及本地 `logs/*.log`
- **精简**: 继续删除无真实流程引用的历史结构噪音，包括根 `memory/` 历史笔记、`config/` 中旧 persona/schema 配置；`README.MD` 已明确当前仓库应收敛为 `V2 主结构 + V1 oracle/回滚层 + 少量公共层`
- **收口**: 机读验收产物职责已进一步固定：共享/`V1` replay 与 eval 基线运行结果改为写入 `eval/reports/`，`V2` compare/readiness 继续写入 `v2/eval/reports/`，`docs/verification/` 回归人类可读标准/状态/报告入口
- **固化**: 新增 `scripts/tools/prune-workspace-artifacts.sh` 与 `make workspace-prune`，把根 `logs/`、根 `memory/`、`v1/dist/`、`v1/coverage/` 以及旧 replay JSON 的清理动作沉淀为可重复执行入口
- **保留**: `v1/e2e/screenshots/` 继续保留为当前 `V1` Playwright 输出目录，避免误伤现行验收路径
- **澄清**: `eval/effect-tuning-cases*.json` 与 `scripts/test/test-effect-tuning-replay.js` / `scripts/test/verify-v2-regression.sh` / `scripts/test/report-v2-readiness.sh` / `v2/eval/runners/compare-v1-v2.ts` 已明确为活跃回归资产，不属于临时产物清理范围
- **收口**: `.gitignore` 中遗留的 `nodejs/` 忽略/例外规则已统一切换到 `v1/`，与当前目录结构保持一致
- **核对**: 当前顶层入口文档未再引用已删除目录，仓库清理结果已与现行结构对齐

### 🧱 V1 / V2 / 公共层分层收口（2026-03-20）

- **新增**: 根 `package.json` 已补 `v1:*` 与 `public:*` 公开入口，外部可从仓库根目录统一调用当前 `V1` 壳、本地验收与部署流程
- **完成**: 原 `nodejs/` 已物理迁移为顶层 `v1/`，`v2 -> v1` 源码依赖、Makefile、测试脚本、开发脚本与远端部署脚本已同步修正
- **收口**: 公共层继续保留根 `package.json` / `Makefile` / `scripts/` / `config/` / 部署资产；`README.MD`、`LOCAL-DEV-GUIDE.MD`、`DEPLOYMENT-GUIDE.MD`、`TODO.MD` 与 `docs/DOCS-INDEX.MD` 已对齐新目录口径

### 🗺️ V2 替换 V1 迁移清单（2026-03-18）

- **新增**: `TODO.MD` 新增 `P11 V2 替换 V1 迁移路线`，把长期目标拆成“保留 `V1` 作为 oracle → 补真实 adapter → 接灰度入口 → 建真实场景验收矩阵 → 明确切换门槛 → 最终替换主入口”的渐进式清单
- **细化**: `P11` 首个未完成项已继续拆分为 `RuntimeAdapter` 合同扩展、`unify_query` 首批真实接线、`runV2Turn / executeCase` 接 adapter、失败语义归一、adapter 回归五个子任务
- **落地**: `v2/src/adapters/` 新增 runtime adapter 合同与 `unify_query` bridge，`executeCase` / `runV2Turn` 已支持注入 adapter、消费真实工具结果，并把空结果/超时/鉴权失败/权限阻塞统一映射到 `evidence / blocker / conclusion`
- **验证**: `v2/tests/runtime-regression.test.ts` 已新增 adapter 成功/失败回归，`npm run v2:test` 当前通过
- **补齐**: `v2/src/app/index.ts` 已新增 `bootstrapV2` 独立入口，`v2/tests/smoke.ts` 已从 placeholder 改为可执行 smoke，并验证 adapter 注入与 `unify_query` bridge 可加载链路
- **收口**: `scripts/test/verify-v2-regression.sh`、`npm run v2:verify` 与 `make verify-v2-regression` 已纳入 `route regression + runtime regression + smoke + full replay + V1/V2 strict compare`，`P11` 的统一守门入口继续收紧
- **新增**: `scripts/test/report-v2-readiness.sh`、`npm run v2:status`、`make v2-readiness-status` 与 `v2/eval/runners/readiness-status.ts` 已落地，会在完整 verify 后自动生成 `docs/verification/V2-READINESS-STATUS.MD` 与 `v2/eval/reports/READINESS-*.json`
- **新增**: `docs/verification/V2-READINESS-CHECKLIST.MD` 已固定“可扩大灰度 / 可切主入口 / 可宣布替换完成”的 readiness 判据，`TODO.MD` 中 `P11` 的“明确替换门槛”已转为固定入口
- **增强**: `v2/eval/runners/readiness-status.ts` 现已接入 DB-backed `LLM/token/tool` phase 观测，`docs/verification/V2-READINESS-STATUS.MD` 会额外输出 `intentInference / toolPlanning / replyGeneration / tool execution` 拆账，以及 `improved / watchlist` case 视图
- **增强**: `v2/src/contracts/replay.ts`、`v2/eval/judges/contract-judges.ts`、`v2/eval/runners/replay-runner.ts` 已把 `blocker / conclusion / tool execution` 纳入正式 replay contract，并在 suite 加载阶段拦截非法 contract；`effect-tuning-core/all` 的 A1/E1 case 已开始消费新字段
- **新增**: `nodejs/src/services/v2-chat-router.ts` 已接入 `/api/chat` 与 `/api/chat/stream` 灰度实验入口；支持 `strategy=V2` 或 `x-sre-copilot-route: v2` 显式切流，也支持 `V2_CHAT_EXPERIMENT_ENABLED + V2_CHAT_ALLOWLIST` 做受控灰度
- **增强**: 当前这组主入口级回归已统一沉淀到 `tests/compat/chat-v2-route.test.ts`，覆盖 `/api/chat` 命中 V2、自动回退 V1、`/api/chat/stream` done metadata 三条关键路径
- **增强**: `v2/tests/runtime-regression.test.ts` 已补 `permission_denied` blocker 回归；`docs/verification/V2-ACCEPTANCE-MATRIX.MD` 已固化主入口 / 工具执行 / 协作补材料 / 权限阻塞 / 回滚路径五类验收
- **增强**: 灰度入口已补齐自动回退与运行态标识；`V2` 异常会自动回落到 `V1`，响应 metadata 回传 `routeMetadata / v2RuntimeObservability`
- **增强**: 新增 `chat-route-runtime-logger.ts` 与 `chat_route_runtime_log`，显式 `V2` 命中/回退/phase timing/LLM observability 现已落库；`v2:status` 的 performance gate 改按真实 `V2 route runtime`（`intentInference / V2 runtime / tool execution`）判定，不再误要求不存在的 `toolPlanning / replyGeneration` LLM 样本
- **修复**: `nodejs/scripts/seed-v2-runtime-sample.ts` 现已按 `sessionId` 轮询 `V2 route runtime` 汇总变化，并补齐 `settleMs` 参数解析，避免主入口 fire-and-forget 落库尚未可见时误报 `delta=0`
- **增强**: `effect-tuning-all.v2.json` 继续收紧 `ET-B1 / ET-D1 / ET-D4` replay contract，把“先证伪现象”“trace / relation 关联输出”从测试断言下沉为正式门禁
- **增强**: `compare-v1-v2.ts` 现会按迁移后的 `preferred_first_tool_classes` 与 `collaborative_request + no-tool` 契约识别“契约对齐型改进”；`ET-A3 / ET-B1 / ET-C1 / ET-C4 / ET-E4` 已按新口径转入 improved，当前 readiness watchlist 已清空，`P11` 的“持续迁移 V1 经验到 V2”顶层项已完成
- **新增**: `v2-chat-router.ts` 新增 `V2_CHAT_MAIN_ROUTE` 总开关与共享 `shouldEnableV2IntentInference(...)` 判定，`/api/chat` 与 `/api/chat/stream` 现在默认由 `V2` 接管主入口，仍可通过显式 `strategy/header=v1` 或关闭主入口开关回滚到 `V1`
- **增强**: 当前这组守门回归已统一沉淀到 `tests/compat/v2-chat-router.test.ts` 与 `tests/compat/chat-v2-route.test.ts`，覆盖“默认 AUTO 走 V2 主入口 / 主入口关闭后恢复实验白名单 / V1 回退仍可用”
- **验证**: 当前根入口 `npm run v2:test:route-regression` 通过，`npm run v2:test` 通过
- **明确**: 当前口径调整为 `V2` 已接管 `/api/chat` 主入口，`V1` 保留为 `spec / eval / regression oracle` 与显式回滚资产，而不是继续作为默认线上主链

### 🏗️ V2 Harness-First 重建方案（2026-03-17）

- **新增**: `docs/design/SRE-COPILOT-V2-HARNESS-FIRST-DESIGN.MD`，明确当前应重建 `runtime` 而非抛弃历史资产，固定 `V1` 作为 `spec + eval + regression oracle`
- **新增**: 方案文档收口了 `V2` 的目录职责、四层 contract、最小执行流、`V1 -> V2` 迁移映射、分阶段实施顺序与切换条件
- **新增**: `v2/` 最小骨架（`contracts / runtime / policies / playbooks / eval / app / tools / adapters / observability`），并提供独立 `package.json` 与 `tsconfig.json`
- **新增**: `v2/eval/specs/replay/effect-tuning-core.v2.json` 与 `replay-case.schema.v2.json`，把 A1 / A2 / B3 首批 case 迁为分层 `case schema 2.0`
- **新增**: `v2/eval/runners/replay-runner.ts` 与分层 judge，本地 `V2 Replay` 首次跑通 `3/3 PASS`
- **约束**: 后续 `V2` 新增能力默认先补 `eval/specs + playbooks/policies`，而不是继续向核心编排堆场景分支

### 🔁 V1 Case 自动迁移与 V1/V2 对比基线（2026-03-17）

- **新增**: `v2/scripts/migrate-v1-replay-cases.ts`，可把 `eval/effect-tuning-cases.json` 自动迁移为 `v2/eval/specs/replay/effect-tuning-all.v2.json`
- **增强**: `replay-case.schema.v2.json`、`replay.ts`、`contract-judges.ts` 现在支持 `must_contain_keywords / must_contain_any_groups / must_not_contain_keywords / must_not_be_generic_manual / source`
- **增强**: `v2/eval/runners/replay-runner.ts` 已抽出可复用运行函数，并修复导入时误触发 CLI 的问题；报告文件名改为秒级时间戳，避免覆盖
- **新增**: `v2/eval/runners/compare-v1-v2.ts`，默认会自动选择与当前 case 集重合度最高的 `V1` 回放报告做对比，而不是盲取最新文件
- **验证**: `v2` 全量迁移后首轮本地 replay 基线为 `5/12 PASS`；`V1 / V2` 对比结果为 `1 improved / 7 regressed / 4 parity-pass`
- **观察**: 当时 `V2` 主要缺口集中在 `B1 / C1 / C4 / D1 / D4 / E1 / E4`，分别对应弱显式对象建模、relation 入口与 collaborative request 语义

### 🧭 V2 runtime 语义补强（2026-03-17）

- **增强**: `runtime.ts`、`model-turn.ts` 新增 `trace`、`businessHint`、`relationIntent`、`noDataSymptom`、`onlineMetricSymptom`、`collaborationHint` 等信号，`V2` 不再只认“显式服务/Pod/域名”
- **增强**: `telemetry-first.policy.ts` 现在支持 `Pod 关联排查 → relation first`、`trace/业务指标场景 → unify_query first`、`启动失败场景 → unify_query + knowledge`
- **增强**: `execute-case.ts` 把入口拆分为 `continue_investigation / collaborative_request / request_evidence` 三类，并按症状生成更贴合场景的 `gap` 与 `missingEvidence`
- **增强**: `build-conclusion.ts` 为 `无数据校验`、`在线人数掉零`、`trace 关联回溯`、`弱证据协作补材料` 输出定向回复，命中迁移 case 的关键词与分组约束
- **验证**: 最新 `V2 replay` 已提升到 `12/12 PASS`；`V1 / V2 compare` 结果更新为 `1 improved / 0 regressed / 11 parity-pass`
- **新增**: `v2/tests/runtime-regression.test.ts` 锁定 `B1 / C1 / C4 / D1 / D4 / E1 / E4` 七类历史 regression，覆盖 `mode / first tool / reply` 语义
- **新增**: `scripts/test/verify-v2-regression.sh`、`npm run v2:verify`、`make verify-v2-regression`，把 `typecheck + regression test + full replay` 收口为统一回归入口
- **新增**: `verify-local-baseline.sh` 的 `offline/tests` 阶段默认纳入 `V2 harness 回归`，`make verify-local VERIFY_STAGE=tests` / `make verify-local-tests` 现在会一起执行 `test:no-llm + playbook coverage + V2 harness`，并支持 `RUN_V2_REGRESSION=0` 显式跳过
- **修复**: `verify-local-baseline.sh` 不再因首个失败步骤提前中断；受监控步骤会继续执行并统一在报告尾部用 `FAIL_COUNT` 判定，避免后续 `Playbook Coverage` / `V2 harness` 证据缺失
- **验证**: `STEP_TIMEOUT_SEC=180 make verify-local-tests` 已确认在 `test:no-llm` 失败后仍继续执行 `Playbook Coverage`、`V2 harness` 与 `ChatOps` 守门；此前统一报告曾暴露 `PASS=5 / FAIL=1`，失败点收敛到既有离线测试 `mcp-config-manager.test.ts`
- **修复**: `mcp-config-manager.test.ts` 已改为对齐 `upsertMcpServer` 当前 SQL 参数顺序的结构化断言，移除脆弱的魔法下标，恢复敏感字段加密用例稳定性
- **修复**: `plan.ts` 在缺少显式 `turnType` 但已有 `working_memory / lastCycle` 信号时，会回退按 `continue_previous` 处理；同时 full-context 准备重新仅由 `requiresFullContext(...)` 决定，恢复 `prepared_context` 风险阻断与 `roleIds` 回填
- **验证**: `npm run test:no-llm` 已恢复通过；`STEP_TIMEOUT_SEC=180 make verify-local-tests` 最新统一报告更新为 `PASS=6 / FAIL=0`，报告文件为 `docs/verification/LOCAL-VERIFY-20260317-214723-20335.MD`

### 🎯 A2 case telemetry-first 稳定性修复（12/12 → 100%）

- **增强**: `plan.ts` `PLAN_SYSTEM_PROMPT` 新增规则6：当用户询问已知服务/Pod/域名的运行状况时，必须优先调用 telemetry/monitoring 工具
- **增强**: `plan.ts` `planWithLLM()` 当 service_locator resolved 时注入 `[服务已定位 — 必须优先 telemetry]` 约束块，明确列出已识别实体，强制 LLM 先走 telemetry 路径
- **增强**: `plan.ts` `planWithLLM()` 当 service_locator resolved 时，从传给 LLM 的工具列表中移除 `get_current_time` 和 `search_knowledge`，消除 LLM 选择干扰项
- **增强**: `plan.ts` `planWithLLM()` 新增 info 日志输出规划请求的 service_locator 状态、候选工具链、LLM 工具列表
- **验证**: A2 case 连续 3 次 PASS；全量 12 case 回放 12/12 PASS (100%)
- **部署**: 版本 `sre-copilot:20260316-214000`

### 🔧 LLM 思考内容泄露修复 stripThinkingContent（2026-03-16）

- **修复**: `llm.ts` 新增 `stripThinkingContent()` 三层过滤（非流式/流式状态机/工具调用路径），移除 `<think>/<thinking>` 标签内容
- **修复**: `rebuild-secret.sh` POSTGRES_PASSWORD 硬编码为 `postgres`，防止被 kubectl apply 覆盖
- **修复**: BK_LLM_MODEL 恢复为 `claude-opus-4-6`
- **部署**: 版本 `sre-copilot:20260316-204544`

## [未发布] - 2026-02-12

### 🎯 服务定位层与“我的服务情况”短路补材料（2026-03-14）

- **新增**: `service-locator.ts`，针对“我的服务情况 / 服务状态 / 服务运行情况”这类问句，优先尝试从当前用户、业务上下文、显式实体中解析服务对象
- **增强**: `observe.ts` 新增 `service_locator` observation provider，运行态会显式记录“是否已解析到服务对象 / 命中的业务 / 可见集群 / 推理摘要”
- **增强**: `plan.ts` 在服务定位结果为 `unresolved` 时会直接生成结构化 `request_evidence`，不再继续泛化工具规划并输出大段排障手册
- **验证**: `cd nodejs && npm run build`
- **验证**: `cd nodejs && npm test -- --runInBand src/services/__tests__/service-locator.test.ts src/agent/__tests__/loop.test.ts src/services/__tests__/semantic-intent-engine.test.ts src/services/__tests__/turn-modeling.test.ts`
- **验证**: 本地定向回归 `86/86` 通过，报告 `docs/verification/LOCAL-VERIFY-20260314-1232.MD`

### 🔐 K8s 安全网关与专家对话隔离修复（2026-03-14）

- **增强**: `k8s_management` 从“verb 白名单透传”升级为“结构化安全动作 + 受控只读 exec”，新增 `get_namespaces`
- **增强**: `k8s_management` 对 `get secret ... -o yaml/json` 等敏感只读操作改为 `requiresConfirmation=true`，不再直接执行
- **增强**: `k8s_management` 会拦截 `--as/--as-group/--token` 等提权或身份覆盖参数，避免绕过统一安全入口
- **修复**: K8s 运行时报 `spawn kubectl ENOENT` 时，现在返回显式依赖缺失错误；运行镜像已补齐 `kubectl`
- **修复**: 专家对话 `new_topic / compound_request` 不再把整段近期对话压回 loop 输入；`prepareContext` 也只在延续类 turn 上注入完整会话/知识依赖
- **调整**: `request_evidence` 场景输出改为更短的“当前卡点 / 建议下一步 / 最小补充材料 / 备选路径”，减少弱证据时的大段模板化 runbook
- **验证**: `cd nodejs && npm run build`
- **验证**: `cd nodejs && npm test -- --runInBand src/services/__tests__/k8s-management.test.ts src/services/__tests__/context-compressor.test.ts src/agent/__tests__/loop.test.ts src/routes/__tests__/admin.test.ts`
- **验证**: 本地定向回归 `164/164` 通过，报告 `docs/verification/LOCAL-VERIFY-20260314-1157.MD`
- **部署**: 已发布版本 `20260314-120549`
- **验证**: `make verify-online` 通过，报告 `docs/verification/ONLINE-VERIFY-20260314-1206.MD`

### 🧪 线上验收脚本稳健性修复（2026-03-14）

- **修复**: `scripts/test/verify-online-regression.sh` 为健康检查、token phase、LLM cross、专家排障回归增加重试，避免 Deployment 刚重启时被瞬时空回复误判为失败
- **修复**: `scripts/test/test-expert-diagnosis-entry.js` 为 `/api/chat` 请求增加 90s 超时，避免单个 case 挂住导致整条线上验收假死
- **验证**: `bash -n scripts/test/verify-online-regression.sh`

### ✅ 线上验收自动化（2026-03-14）

- **新增**: `scripts/test/verify-online-regression.sh`，把远端部署后的关键线上回归收口为稳定脚本
- **新增**: `make verify-online`，统一执行远端部署元数据、集群内 `/health`、`/api/admin/token-usage/phase-breakdown`、专家排障入口回归
- **新增**: 本地验收记录 `docs/verification/LOCAL-VERIFY-20260314-0441.MD`
- **验证**: `bash -n scripts/test/verify-online-regression.sh`
- **验证**: `cd nodejs && npm run build`
- **验证**: `make verify-online` 通过，生成 `docs/verification/ONLINE-VERIFY-20260314-0433.MD`
- **待优化**: 专家排障链路线上延迟仍偏高，已回挂 `TODO.MD`

### 🚀 远端部署与线上回归（2026-03-14）

- **部署**: 已通过 `make deploy-fast` 发布版本 `20260314-035443`，镜像为 `registry.example.com/sre-copilot/sre-copilot:20260314-035443`
- **验证**: 远端 K8s 新 Pod `sre-copilot-app-76ffcdf94-q27xs` 已就绪，部署脚本内 `/health` 检查通过，返回 `database=connected`、`wecom.status=healthy`
- **验证**: 公网入口 `https://sre-copilot.example.com/sre-copilot` 当前受公司 SSO 保护，匿名 API 请求会 `302` 跳转 Passport；本次真实 API 回归改由远端主机 `kubectl port-forward -> svc/sre-copilot-service`
- **验证**: `GET /api/admin/token-usage/phase-breakdown` 线上已返回三段链路聚合数据，`toolPlanning` / `replyGeneration` 明细可见 `provider / model / requestType / tokens`
- **验证**: `node scripts/test/test-expert-diagnosis-entry.js` 在线上集群内链路回归 `3/3 PASS`
- **新增**: 验收报告 `docs/verification/ONLINE-VERIFY-20260314-0426.MD`
- **观察**: 专家排障链路当前可用但延迟偏高，线上日志观察到单请求完成时间约 `40s ~ 80s`

### ✅ TODO 主线收口与本地验收（2026-03-14）

- **增强**: `token-usage-tracker.ts` 新增 `getTokenUsagePhaseBreakdown()`，按 `intentInference / toolPlanning / replyGeneration` 聚合 token、成本、请求数以及 `provider / model / requestType / taskType / apiPath / endpoint`
- **增强**: `llm.ts` 记录 token_usage 时已把 `taskType / agentId / apiBase / apiPath / endpoint / phase` 写入 metadata，后续链路统计不再只能看总量
- **增强**: `admin.ts` 新增 `/api/admin/token-usage/phase-breakdown`，`observability.html/js` 新增“Token 三段链路分布”面板，可直接看到每段链路的 provider/model/接口与 token 消耗
- **增强**: `act.ts` 默认主线程汇总合同已固定为 `现象 / 当前轮已确认事实 / 未确认假设 / 建议动作 / 待验证项`，并要求历史知识显式标注为“历史经验提示”
- **增强**: `reflect.ts` 新增 `assessment`，显式回传 `evidenceScore / fallbackScore / conclusionScore / overallScore`，把证据充分性和换路行为纳入评估
- **增强**: `input-entity-modeling` 与 `entity-resolution` 的实体占位/按需加载已补齐回归，覆盖工具、业务、`table_id`、`trace_id`、链接、附件与大文本块
- **增强**: playbook step 当前已显式挂载到子线程元数据，`loop` 回归已覆盖“playbook step 会挂到当前子线程，避免与线程模型分叉”
- **新增**: `docs/tools/TOOL-COVERAGE-INVENTORY.MD`，收口监控 / 日志 / SSH / K8s / DataID / UnifyQuery 的工具覆盖与 playbook 绑定口径
- **验证**: `npm run build`
- **验证**: `npm test -- --runInBand src/agent/__tests__/loop.test.ts src/routes/__tests__/admin.test.ts src/services/__tests__/llm.test.ts src/services/__tests__/wecom.test.ts src/services/__tests__/entity-resolution.test.ts src/services/__tests__/input-entity-modeling.test.ts src/services/__tests__/turn-modeling.test.ts src/services/__tests__/semantic-intent-engine.test.ts src/__tests__/srectl.test.ts`
- **验证**: 上述本地回归共 `213/213` 通过；`observability.js` 语法检查通过

### 🧾 用户材料进入一等证据链路（2026-03-14）

- **新增**: `services/user-evidence.ts`，开始把用户输入中的 PromQL、报错、日志/配置片段和附件元数据提取成结构化 `userEvidenceItems`
- **增强**: `turn-modeling.ts` 已将 `userEvidenceItems` 挂入 `TurnModel`；`observe.ts` 和 `/api/chat` intent metadata 也开始透传这组用户证据对象
- **增强**: `entity-resolution.ts` 与 `act.ts` 已支持按 `threadId` 注入 `[用户提供证据]`，用户材料现在会和实体占位、线程证据摘要一起进入 answer prompt
- **增强**: `thread-execution.ts` 已为主线程/子线程累计 `userEvidenceItems`，用户材料不再只是普通上下文文本
- **验证**: `npm run build`，以及 `loop / turn-modeling / entity-resolution / semantic-intent-engine` 定向测试共 `74/74` 通过

### 📈 动态工具排序开始偏向 telemetry-first（2026-03-14）

- **增强**: `plan.ts` 已去掉 `k8s_management` 的专用硬门禁，不再要求命中固定 K8s 关键词才允许参与动态候选
- **增强**: `preferredToolClasses` 现在作为排序加分而不是硬过滤，子线程保留了继续换路的空间
- **增强**: 当前线程若已抽到用户提供的 PromQL、错误日志等 telemetry 材料，`query_*` 工具会获得额外排序加分
- **增强**: `semantic_memory` 中的长期记忆、runbook 摘要和 OPAR 策略提示已开始编译为 `planning guidance`，前置参与规则排序和 LLM planning prompt
- **增强**: planner 已开始为每个线程维护显式 `candidateChain / threadFallbackChains`；某线程首选工具已尝试且仅返回弱证据时，下一轮会沿同线程未尝试候选继续
- **增强**: blocker 已开始真正影响换路策略：`evidence_blocked` 会继续偏向 telemetry，`tooling_gap` 会提升 knowledge 并压低 SSH
- **增强**: 当自动候选已经耗尽且 blocker 已给出 `minimumUserInputs` 时，规则规划会直接转为结构化 `request_evidence`
- **增强**: `reflect.ts` 已能识别 `403/401/forbidden/权限不足` 等错误为 `permission_blocked`，避免继续盲重试
- **增强**: `planWithLLM` 已复用 blocker-aware `candidateChain`，并把候选链与排序理由显式注入 LLM planning prompt，减少规则规划与 LLM 规划漂移
- **增强**: 主线程 answer prompt 已单独注入 `[主线程用户材料]`，用户截图/PromQL/日志片段会优先用于约束结论边界，而不是被埋进普通上下文
- **增强**: `entity-resolution.ts` 已把用户材料进一步映射为显式“验证重点”（如 `observation_truth / query_correctness / runtime_failure / config_state / telemetry_correlation`），planner 会基于这些验证目标决定先验证什么
- **增强**: `turn-modeling.ts` 与 `task-thread-modeling.ts` 已把这组验证目标正式收口到 `subgoal / taskThread.validationIntent`，不再只是 planner 内部的临时 hints
- **增强**: `act.ts` 已开始把 `taskThread.validationIntent` 编译进主线程 answer guidance 和线程证据摘要，主线程汇总会显式知道各子线程当前优先验证什么
- **增强**: `reflect.ts` 已开始消费 `taskThread.validationIntent` 生成 blocker 摘要与推荐下一步，卡点会明确落到“现象真实性验证 / 查询正确性验证 / telemetry 关联验证”等验证阶段
- **增强**: `thread-execution.ts` 已开始把线程级 `validationIntent / validationStage / validationSummary` 编入运行态摘要；子线程状态不再只是 `pending/guidance/evidence/answered`
- **增强**: `/api/chat` 与 `/api/chat/stream` 的 `agentRuntimeObservability` 已新增 `validationProgress`，可直接看到主线程/子线程当前所处验证阶段及证据数量
- **增强**: `static/chat.html` 与 `static/admin.html` 的调试面板已开始展示 `validationProgress + blocker`，可直观看到线程当前验证目标、所处阶段与卡点
- **增强**: synthetic `request_evidence` 已开始透传 `validationSummary`，最终补材料文案会显式说明“当前优先在补哪类验证材料”
- **增强**: playbook `request_evidence` 现也会从当前线程继承验证目标，补材料说明在 playbook 与 synthetic blocker 路径上已基本一致
- **验证**: `turn-modeling / semantic-intent-engine / entity-resolution / loop` 定向回归已覆盖 `validationIntent` 上链；当前定向测试 `81/81` 通过，`npm run build` 通过
- **验证**: 新增 `thread-execution.test.ts`；当前定向测试 `82/82` 通过，`npm run build` 通过
- **验证**: 新增 `synthetic request_evidence 会显式说明当前补的是哪类验证材料` 回归；当前定向测试 `83/83` 通过，`npm run build` 通过
- **验证**: `HTML_INLINE_SCRIPTS_OK:2` 通过

### 🔭 LLM 可观测补齐 API/模型摘要（2026-03-14）

- **新增**: `llm.ts` 导出统一 `getLlmRuntimeSummary()`，对外提供 `provider / apiBase / apiPath / endpoint / model / requestType / stream` 运行态摘要
- **增强**: `/api/chat` 与 `/api/chat/stream` 的返回 `metadata` 新增 `llmObservability`，区分 `intentInference / toolPlanning / replyGeneration` 三段链路
- **说明**: 当前 `intentInference` 在专家对话默认仍走 heuristic 模式，因此会明确标出 `enabled=false` 与原因，而不是伪装成已实际调用 LLM
- **验证**: `llm.test.ts` 已补充运行态摘要回归，`npm run build` 与定向测试通过

### 🧵 子线程执行态开始跨轮累计（2026-03-14）

- **增强**: `agent/thread-execution.ts` 现支持基于上一轮执行态合并本轮结果，子线程状态按 `pending -> guidance_only -> evidence_ready -> answered` 单向提升
- **增强**: `AgentState` 新增 `threadExecution`，`loop` 初始化时会为当前轮 `threadPlan` 建立主线程/子线程运行态
- **增强**: `act.ts` 在每轮结束后会把累计 `threadExecution` 写回状态，并同步回挂到结果 metadata，供后续 `plan / reflect / chat metadata` 统一消费
- **增强**: `plan.ts` 在挑选 pending 子线程的后续工具时，已优先读取跨轮累计的 `threadExecution`，不再只依赖上一轮单次 answer 附带的快照
- **验证**: `loop.test.ts`、`npm run build` 本地通过

### 🧠 主线程收口门禁增强（2026-03-14）

- **增强**: `thread-execution.ts` 现在会额外推导 `mainThreadStatus` 与 `readyToConclude`，不再把“子线程都结束”直接等同于“整轮可以收口”
- **增强**: `reflect.ts` 已新增主线程收口判定；当子线程都已有证据，但主线程回答仍是 `guidance_only` 时，会继续下一轮而不是提前 `done=true`
- **增强**: `reflect.ts` 现在还会检查子线程 bundle 质量；只有 `guidance / hypothesis`、没有实时 `evidence` 的子线程，不再允许伪装成已满足收口条件
- **增强**: `Reflection` 已新增结构化 `blocker`，可区分 `evidence_blocked / tooling_gap / requires_user_decision`，用于后续协作式推进
- **增强**: `runAgentLoop` 在无法自动收口但已识别 `blocker` 时，会直接生成协作式推进回复；`/api/chat` 的 agent runtime metadata 也开始透传 blocker
- **验证**: `loop.test.ts` 新增“子线程已满足但主线程结论仍弱时不应直接 done”回归并通过

### 🧾 主线程汇总结构进入 answer contract（2026-03-14）

- **增强**: `act.ts` 在存在线程计划时，会自动为主线程 answer 合并默认汇总结构合同，要求输出“当前轮已确认事实 / 未确认假设 / 建议动作 / 待验证项”
- **增强**: 上述默认结构不再依赖 playbook；即使是普通复合请求，只要进入主线程/子线程模型，也会对最终汇总结论施加同样约束
- **验证**: `loop.test.ts` 新增“多子线程场景下 answer 会自动附带主线程汇总结构合同”回归并通过

### 🧭 Agent 主链路整治计划收口（2026-03-13）

- **更新**: `TODO.MD` 已将下一阶段主线收口为“当前轮任务建模 -> 证据/知识分层 -> 搜索式 loop -> 结论汇总 -> 回归验收”，明确不再以补意图关键词或单点特判作为主解决路径
- **更新**: `docs/design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD` 已补充 `Turn Modeling Layer`、`subgoals`、`evidence / guidance` 分层与“主路径失败后换备用路径”的设计约束，固定后续实现边界
- **调整**: 知识检索在设计口径上已明确退回为路径提示和参数线索，不默认作为最终结论来源；最终答案需要当前轮实时证据支撑

### 🧩 当前轮任务建模落地（2026-03-13）

- **新增**: `nodejs/src/services/turn-modeling.ts`，为每条新输入统一产出 `turnType / subgoals / constraints / preferredToolClasses`，覆盖 `continue_previous / new_topic / compound_request / clarification / constraint_update`
- **新增**: `nodejs/src/services/input-entity-modeling.ts` 与 `nodejs/src/services/task-thread-modeling.ts`，为当前轮模型补充 `EntityRef` 与“主线程 + 子线程”计划骨架
- **增强**: `semantic-intent-engine` 现在会在意图结果中附带 `turnType / subgoals / turnModel`，供后续 loop 和回答汇总消费
- **增强**: `semantic-intent-engine` 现在还会附带 `entityRefs / threadPlan`，为后续原文保留、按需加载和子线程执行提供统一输入
- **增强**: `/api/chat` 与 `/api/chat/stream` 的 `intentObservability / intentDecision` 已开始回传当前轮任务建模结果；`agent observe` 同步注入 `turn_model` observation
- **增强**: `agent-integration` 的语义记忆上下文已开始记录 `turnType` 和子任务摘要，减少专家入口后续继续只依赖原始输入文本
- **验证**: 新增 `turn-modeling` 单测，并补强 `semantic-intent-engine` 回归；本地 `npm run build` 与定向测试通过

### 🧵 主线程/子线程与实体引用设计收口（2026-03-13）

- **更新**: `TODO.MD` 已补充“主线程 + 子线程”执行模型，以及“原文保留 + 实体占位 + 按需展开”的后续任务
- **更新**: `docs/design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD` 已明确主线程负责全局约束和结论裁决，子线程负责工具尝试与失败换路；同时将压缩上下文降级为 prompt 适配层，不再作为唯一事实源

### 🧪 证据门禁第一阶段（2026-03-13）

- **增强**: `agent/act.ts` 现在会为工具结果和回答标记 `evidenceLevel`，区分 `evidence / guidance / hypothesis`
- **增强**: `agent/act.ts` 会识别空工具结果、`source=none`、空列表等弱结果，不再默认视为有效实时证据
- **增强**: `agent/reflect.ts` 已新增“knowledge-only answer 不可直接完成”和“空工具结果应继续换路”的门禁
- **验证**: 已补 `loop.test.ts` 定向回归，覆盖 knowledge-only answer 与弱工具结果两类场景；本地 `npm run build` 与定向测试通过

### 🪟 LLM 上下文与输出预算放宽（2026-03-13）

- **调整**: `context-compressor.ts` 不再固定为 `1200` token 级预算，现已改为环境变量可配置，默认提升到 `4800`；摘要预算、保留轮数和助手历史截断长度也同步放宽
- **调整**: `llm.ts` 已将普通回答默认 `maxTokens` 从 `1024` 放宽为可配置的 `2048`，工具上下文回答默认放宽到 `6144`
- **调整**: 工具规划 `callLLMWithTools()` 的默认 `maxTokens` 已提升到 `1536`
- **说明**: 流式回答路径保持可用，`/api/chat/stream` 继续走 SSE；这次主要解除人为预算过小的问题，而不是替换流式机制
- **验证**: 本地 `npm run build`、`llm.test.ts`、`loop.test.ts`、`turn-modeling.test.ts`、`semantic-intent-engine.test.ts` 通过

### 🔐 Admin 业务上下文自动解析（2026-03-13）

- **修复**: 业务级工具在未显式传入 `businessId` 时，不再只依赖 `defaultBusinessId`；现在会继续回退到用户白名单中的首个业务
- **增强**: `admin` 角色的业务可见范围统一扩展为系统内全部已配置业务，避免出现“是管理员但上下文里看不到业务”的割裂状态
- **增强**: `/api/me/context` 与访问矩阵新增 `effectiveBusinessId`，用于展示运行时实际命中的业务上下文
- **修复**: `k8s_management` 等业务级工具在 `shamcleren` 这类 admin 用户上，已可自动解析到业务 `2` 并读取对应业务集群配置

### 🔎 UnifyQuery 去环境化（2026-03-13）

- **调整**: 系统级 `unify_query` 配置不再维护 `environments` 多环境覆盖，收口为单套 `baseUrl / headers / spaceUidTemplate / flows`
- **调整**: `query_trace` 与 `query_log` 的 `flows.trace / flows.log` 不再按环境映射，改为按来源业务 ID 映射到目标 `businessId / tableId / dataSource`
- **调整**: Admin 中的 UnifyQuery 系统配置面板已移除环境配置输入，模板与说明统一改为“按业务映射”

### 🔎 UnifyQuery Trace/Log 取消串联（2026-03-13）

- **调整**: `query_trace` 与 `query_log` 不再依赖 `flows` 配置串联，改为和 `query_metrics` / `query_raw` 同层的直接工具
- **调整**: 调用 `query_trace` / `query_log` 时，需要直接传入 `businessId / tableId / dataSource`，系统只负责统一接入与 `spaceUid` 推导
- **调整**: Admin 中的 UnifyQuery 系统配置面板已移除 `flows`，系统级配置仅保留 `baseUrl / headers / spaceUidTemplate / timeoutMs`

### 🏢 业务视角配置收口（2026-03-11）

- **新增**: `businesses` 主数据模型与 Admin 业务管理入口，支持按业务维护名称、描述、业务级 K8s 配置与业务归属 MCP 服务
- **增强**: `tool_configs` 新增 `business` owner，`k8s_management` 与 MCP 工具解析优先走业务配置，用户级配置仅作为覆盖/回退
- **增强**: `k8s_management` 支持 `kubeconfigContent`，运行时会写入临时 kubeconfig 文件，不再强依赖容器内固定路径
- **增强**: 业务级 K8s 配置已进一步正规化为 `business_clusters` 表，Admin 从整块 JSON 编辑切换为“多集群列表 + 单条集群表单”管理，同时保留旧接口兼容导入/清空
- **新增**: 内置接入 BlueKing UnifyQuery 第一阶段能力：`query_metrics`、`query_raw`、`list_field_keys`、`list_tag_keys`、`list_tag_values`、`get_field_map`，统一走系统级 `unify_query` 配置，不再依赖 MCP
- **增强**: 内置新增 `query_promql`，支持通过系统级 `unify_query` 配置直连 APIGW `/query/promql` 执行 PromQL 查询
- **新增**: 内置补充 BlueKing UnifyQuery 资源关联查询能力：`query_relation_multi_resource` 与 `query_relation_multi_resource_range`，通过系统级 `unify_query` 配置访问 APIGW `relation/*` 接口，覆盖 pod/container/app_version/git_commit/host/system 等通用关系链查询
- **增强**: Admin「系统设置」新增系统级 UnifyQuery 配置入口，统一维护 `baseUrl / headers / spaceUidTemplate / timeoutMs`，业务仅通过请求参数授权
- **增强**: 系统级 `unify_query` 已支持多环境与流程映射：可通过 `environments.bkop / environments.bkte` 维护不同 APIGW/鉴权，再通过 `flows.trace / flows.log` 按来源环境映射到目标环境、业务 ID、`table_id` 与 `data_source`
- **新增**: 内置新增 `query_trace` 与 `query_log`，把 trace / 日志明细查询封装成跨环境可配置流程，支持例如 `bkte -> bkop/business 7/table_B` 这类映射
- **调整**: 已从线上环境移除历史 UnifyQuery MCP `bkmonitorv3-prod-metrics-query`，当前收口到系统级 `unify_query` 内置工具；Admin 默认鉴权示例同步改为 `X-Bkapi-Authorization` JSON 头格式
- **增强**: `mcp_servers` 新增 `business_id`，Admin 的 MCP 面板支持按业务筛选与绑定归属
- **调整**: 首页、全局导航和页面路由已移除 ChatOps 主入口，治理主路径统一收口到 `Chat + Admin`

### 📚 排障自动化文档基线收口（2026-03-09）

- **新增**: `docs/design/TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD`，冻结本轮评估结论，明确当前系统仍是“排障助手”
- **新增**: `docs/design/CURRENT-IMPLEMENTATION-MAP.MD`，固化当前代码主链路、入口差异、能力边界和主要缺口
- **新增**: `docs/design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD`，定义围绕评估语料推进的目标设计
- **新增**: `docs/verification/VERIFICATION.MD`、`docs/verification/ITERATION-PLAN.MD`、`docs/verification/PROGRESS-REPORT.MD`、`docs/verification/LIVE-RUN-STATUS.MD`，形成“验收标准 + 阶段计划 + 当前进展 + 接续入口”闭环
- **更新**: `README.MD`、`docs/design/TECHNICAL-DESIGN.MD`、`docs/roadmap/ROADMAP.MD`、`docs/DOCS-INDEX.MD`，统一到“以评估语料为验收基线”的新主线
- **更新**: `.gitignore`，允许 `docs/verification/` 下的稳定基线文档进入版本控制，同时继续忽略自动生成的回归产物
- **清理**: 将 `docs/review/PROJECT-REVIEW.MD` 标记为历史初评，移除主入口文档中“P0-P7 全部完成 / 稳定运维阶段”等失效叙述

### 🧭 排障场景化第一轮实现（2026-03-09）

- **调整**: Web 首页与全局导航已收口到核心功能入口，只保留 `工作台 / 对话工作台 / 治理后台 / ChatOps / 可观测性`，移除架构页、设计亮点页、性能页、记忆展示页等非核心展示入口
- **调整**: `/architecture`、`/highlights`、`/chatops/design`、`/agent-team`、`/dual-system`、`/opar-loop`、`/tool-gateway`、`/performance`、`/memory` 等旧展示页路由已改为兼容跳转，不再作为主页面继续暴露
- **清理**: 已物理删除 `nodejs/static/architecture-diagram.html`、`design-highlights.html`、`three-layer-memory.html`、`memory-workbench.html`、`performance.html`、`agent-team.html`、`chatops-design.html`、`dual-system.html`、`opar-loop.html`、`tool-gateway.html` 与过时的 `nodejs/static/README.MD`
- **新增**: `docs/verification/MULTI-ENTRY-TEST-RUNBOOK.MD`，固化 Admin 前置配置与 `CLI -> Web Chat -> WeChat` 的多入口测试顺序
- **增强**: `nodejs/static/admin.html` 的用户管理新增“工具配置”入口，可直接为测试用户写入 `k8s_management` 与 `ssh_remote_management` 的用户级工具配置，降低手工联调前置成本
- **新增**: `nodejs/src/services/troubleshooting-scenarios.ts`，沉淀第一批样板场景 profile
- **新增**: `nodejs/src/services/troubleshooting-playbooks.json`，以文件化 JSON 承载首批场景 / playbook 数据与模板变量
- **增强**: `semantic-intent-engine`，在启发式路径输出 `scenario / needClarification / evidenceItems / suggestedStepCount`
- **增强**: `agent plan/act/reflect`，新增 `request_evidence` 与 `playbook_response` 结构化动作
- **增强**: `agent plan` 开始直接消费 playbook step，支持 tool-first playbook，为 `DataID` 这类查询场景增加工具优先路径与回答约束
- **增强**: `agent plan` 改为按 playbook step 序列规划，支持跳过已完成 step，逐步消费更多工具 / 回答步骤
- **增强**: 工作记忆开始持久化 `playbookProgress`，`/api/chat` 与 `/api/chat/stream` metadata 增加当前 playbook 进度，支持跨轮继续排查
- **增强**: `agent plan` 对 `request_evidence` 增加“当前输入已补关键证据则继续下一步”的启发式推进
- **增强**: `request_evidence` step 开始支持文件化 `evidenceMatchers`，证据满足判断从展示文案关键词拆解演进到 playbook 数据契约
- **增强**: 新增 `troubleshooting-evidence-evaluator.ts`，把 `request_evidence` 的继续条件从 `plan.ts` 内联逻辑抽成 evidence contract + evaluator
- **增强**: `playbookProgress` 开始持久化 step 级 evidence state，支持跨轮累积部分证据后继续推进
- **增强**: 新增 `troubleshooting-playbook-progress.ts`，把 `next / waiting_evidence / collecting_evidence / completed` 这些 playbook step 状态推导抽成共享服务
- **增强**: `plan` 与 `chat-playbook-progress` 开始共同消费 `troubleshooting-playbook-progress.ts`，减少阶段推进逻辑分叉
- **增强**: `troubleshooting-playbook-progress.ts` 开始显式推导 `collecting_evidence / executing_tools / responding / completed` phase，planner 当前轮 runnable step 窗口开始按 phase + step status 决策
- **增强**: `troubleshooting-playbook-progress.ts` 开始负责当前轮 runnable step 窗口推导，planner 不再自行拼接执行序列
- **增强**: 新增 `agent/troubleshooting-playbook-plan.ts`，把 playbook step 到 `request_evidence / tool_call / playbook_response / answer` 的编译逻辑从 `plan.ts` 抽离
- **增强**: 新增 `agent/troubleshooting-playbook-memory.ts`，把工作记忆中的 playbook 进度读取、pending evidence 补齐判断和历史成功 step 合并逻辑从 `plan.ts` 抽离
- **增强**: 新增 `troubleshooting-scenario-loader.ts` 与 `troubleshooting-scenario-matcher.ts`，把场景文件加载、结构校验、模板实例化与启发式匹配从 `troubleshooting-scenarios.ts` 继续外拆
- **增强**: 场景定义新增 `priority`，`troubleshooting-scenario-loader.ts` 现在按显式优先级排序，不再依赖 JSON 文件顺序决定命中先后
- **增强**: 新增 `ChatInnerService 成功率 PromQL 误报` 与 `Windows bkmonitorbeat InitTempDir 启动失败` 两个主线 playbook 场景，继续验证“新增场景主要加数据”
- **增强**: 新增 `CodeV 仪表盘查询异常` 与 `40980 vCluster 采集异常` 两个主线 playbook 场景，继续按真实 case 扩展主线覆盖面
- **增强**: 新增 `金铲铲海外版在线人数掉零` 与 `元梦之星 DataID 指标异常` 两个主线 playbook 场景，继续按真实 case 扩展主线覆盖面
- **增强**: 新增 `qcloud-exporter Redis 指标无数据` 与 `ServiceMonitor 已删除 Pod 未清理` 两个主线 playbook 场景，继续按真实 case 扩展主线覆盖面
- **增强**: 新增 `bkmonitorbeat CPU 异常飙高` 主线 playbook 场景，继续按真实 case 扩展主线覆盖面
- **增强**: 新增 `火影忍者查询无数据` 主线 tool-first playbook 场景，继续按真实 case 扩展主线覆盖面
- **增强**: 新增 `41946 集群采集无数据` 与 `APM Service 关联模型查询异常` 两个主线 playbook 场景，继续按真实 case 扩展主线覆盖面
- **增强**: 新增 `troubleshooting-corpus-coverage.test.ts`，将 `eval/corpus.json` 的 15 个主线 case 与预期 playbook 命中关系固化为本地回归
- **增强**: 新增 `eval/playbook-coverage-map.json`，将主线 case 到 `scenario / playbookId` 的覆盖映射数据化，减少测试代码里的硬编码
- **增强**: 新增 `troubleshooting-playbook-coverage-map.test.ts`，校验 `eval/corpus.json`、coverage map 与文件化 playbook 三层一致性
- **增强**: 新增 `npm run verify:playbook-coverage` 与 `nodejs/scripts/verify-playbook-coverage.js`，把主线 case 覆盖校验收敛成独立本地验收入口
- **增强**: `make verify-playbook-coverage` 与 `scripts/test/verify-local-baseline.sh` 已接入 Playbook Coverage 校验，离线本地验收默认覆盖主线 case 命中验证
- **增强**: `verify-prune` 已接入 `PLAYBOOK-COVERAGE-VERIFY-*.MD` 滚动清理，并同步更新验收规范与验证文档
- **增强**: `docs/design/CURRENT-IMPLEMENTATION-MAP.MD`、`nodejs/static/architecture-diagram.html`、`nodejs/static/design-highlights.html`、`nodejs/static/index.html` 已同步到当前 playbook 主链路口径，明确 `srectl ask -> /api/chat`、15 个主线 case 覆盖与本地 verify 入口
- **增强**: tool-first playbook 已支持 step 级 `toolBindings`，planner 会优先按当前 step 的工具绑定选择工具和参数，而不是主要依赖 profile 级 `toolRouting`
- **增强**: `troubleshooting-scenario-matcher.ts` 已开始在实例化场景时从首个 `tool` step 自动推导兼容 `toolRouting`，`DataID` 与 `火影忍者查询无数据` 场景已移除 profile 级 `toolRouting` 重复定义
- **增强**: 新增 `getScenarioToolRouting` 共享 helper，`/api/chat` metadata 与 planner 的 profile 级工具路由回退开始共用同一套推导逻辑
- **增强**: 文件化 playbook 中的 `DataID` 与 `火影忍者查询无数据` tool-first 场景已去掉 `allowedToolNames` 旧字段，并新增回归防止 profile 级 `toolRouting` / step 级 `allowedToolNames` 被重新写回 JSON
- **增强**: 新增 tool step 归一化逻辑，运行时会把 legacy `allowedToolNames + toolParams` 自动转成 `toolBindings`，planner 与工具路由推导继续收敛到统一契约
- **增强**: `summarizePlaybook` 对外已不再暴露 `allowedToolNames`，`/api/chat` metadata 中的 playbook 摘要统一回传归一化后的 `toolBindings`
- **增强**: `/api/chat` metadata 中的 `toolRouting` 已开始附带 `toolRoutingSource`，当前可以区分路由来自当前 step、playbook step 还是 profile 兼容字段
- **增强**: planner 已开始只在 `toolRoutingSource=profile_compat` 时才消费旧 `toolRouting`，`playbook_step` 级路由不再反向喂回核心执行链路
- **增强**: tool-first 场景实例化已不再把派生 `toolRouting` 自动写回 profile，兼容工具路由开始收敛到 helper / metadata 视图
- **增强**: `/api/chat` metadata 中的 `toolRouting` 当前已只在 `profile_compat` 时暴露，step / playbook_step 路由统一通过 `toolPlan` 呈现
- **修复**: `plan` 现在会先执行 `context-preparer` 再拉取工具列表，`prepared_context` 回填的 `roleIds` 会真实影响本轮工具候选，修复统一本地验收中的双系统断言回归
- **修复**: `nodejs/k8s/ingress.yaml` 已为 `sre-copilot` 补齐 `/sre-copilot` 前缀入口，并新增 `websecure` IngressRoute，修复当前远端 K8s 下 `https://sre-copilot.example.com/sre-copilot/` 未正确暴露的问题
- **调整**: Web 公共基路径已从 `/expert` 切换为 `/sre-copilot`，静态页资源、导航链接、页面跳转和 `srectl --base-url` 规范化逻辑已同步更新；`/expert` 不再作为默认公开入口
- **修复**: `scripts/deploy/deploy-remote.sh` 的部署后健康检查改为优先选择 Running Pod，并改用容器内 Node `fetch` 探活，避免 rollout 成功后仍误选 Terminating 旧 Pod或因容器无 `curl` 造成假失败
- **增强**: `/api/chat` metadata 中的 `intentDecision` 已开始附带 `toolPlan`，主视图开始直接暴露 step 级工具摘要，`toolRouting` 继续保留为兼容视图
- **增强**: planner 已开始只在 `toolRoutingSource=profile_compat` 时才回退到旧 `toolRouting`，`playbook_step` 级路由不再作为核心执行链路的反向输入
- **增强**: `request_evidence` 输出开始优先按当前 step 的 `requiredEvidence` 渲染，减少 profile 级文案对执行契约的反向耦合
- **增强**: 路由新增 `chat-playbook-progress` helper 和单测，非排障消息会清理残留 `playbookProgress`
- **增强**: `answer` step 开始支持 `outputSections / mustIncludeKeywords`，planner 会自动编译回答结构与关键词约束
- **增强**: `reflect` 开始校验 answer 是否满足 step 级 section / keyword 约束，不满足时继续下一轮
- **增强**: `reflect` 开始校验已知 `conclusionSchema` 的最小输出结构，当前覆盖 `evidence_request_v1 / diagnosis_v1 / info_summary_v1`
- **增强**: 新增 `troubleshooting-conclusion-schemas.json` 与 conclusion validator 服务，把最小结论 schema 规则从 `reflect` 硬编码抽离为文件化定义
- **增强**: `troubleshooting-scenarios.ts` 从代码内 registry 演进为“文件化 playbook 加载 + 模板实例化 + 启发式 matcher”过渡层
- **增强**: `/api/chat` 与 `/api/chat/stream` metadata，开始回传场景、补材料线索、工具路由提示和面向排障步骤的 `stepCount`
- **验证**: 新增单测覆盖首批场景识别、工具优先路径与 loop 行为，构建通过
- **补充约束**: 设计与计划文档明确“代码内场景 registry 仅为过渡态”，长期目标是新增排障场景主要通过补 playbook 数据完成，而不是继续 hardcode 核心执行链路

### 🧪 自动排障评估集升级（2026-03-09）

- **重构**: `eval/corpus.json` 从单轮关键词题库升级为链路型评估 schema，按 `intent / task_flow / interaction / tools / conclusion` 5 个维度描述真实排障期望
- **新增**: `eval/grade-response.js` 结构化 grader，直接消费 `/api/chat` 返回的 `metadata.intentObservability / intentDecision / toolCalls / stepCount`
- **重构**: `eval/run-eval.sh` 改为按维度打分并输出失败检查项、维度均分与结构化结果，不再只看关键词命中
- **增强**: 评估 case 覆盖信息查询、权限感知查询、兼容性问题、链路断裂、PromQL 语义、配置 reload、K8s 清理机制、Windows 启动失败、组件性能缺陷等自动排障关键路径

### 🔧 CLI 验收与文档完善（2026-03-09）

- **验收**: `srectl` CLI 全部 6 命令 20/20 测试用例通过（whoami/ctx show/access show/session show/audit list/ask × 人类可读 + JSON + 错误处理 + 兼容性）
- **新增**: `docs/tools/CLI-REFERENCE.MD` — CLI 完整参考文档（命令/选项/退出码/环境变量/输出格式/兼容性/验收记录）
- **更新**: `README.MD` — CLI 说明扩充为完整 6 命令 + 全局选项 + 兼容别名，状态快照更新至 P7 完成
- **更新**: `nodejs/README.MD` — CLI 段落增加选项表格、退出码说明与兼容别名
- **更新**: `DEPLOYMENT-GUIDE.MD` — 品牌名统一 SRE Copilot、Node.js 18→20、新增 CLI 验证段落
- **更新**: `docs/DOCS-INDEX.MD` — 新增 CLI 参考文档索引

### 🏷️ 项目重命名（2026-03-06）

- **重命名**: 项目品牌统一为 `SRE Copilot`，仓库 / 包 / K8s / MCP slug 统一为 `sre-copilot`
- **新增**: `nodejs/bin/srectl.js` 作为正式 CLI 入口，默认使用 `SRECTL_TOKEN` / `SRECTL_BASE_URL`
- **兼容**: 保留 `nodejs/bin/de.js` 作为 CLI 兼容别名，并继续兼容 `DE_TOKEN` / `DE_BASE_URL`
- **更新**: `README.MD`、`nodejs/README.MD`、静态页面、部署脚本与配置样例同步切换到 `SRE Copilot` 命名
- **更新**: `docs/DOCS-INDEX.MD`、`docs/tools/MCP-CURSOR-VS-SRE-COPILOT.MD`、`docs/design/SRE-COPILOT-VS-ASSISTANTS-API.MD` 与其他设计文档，统一新命名

### 📚 文档现状收口（2026-03-06）

- **更新**: `docs/design/TECHNICAL-DESIGN.MD`，修正 ChatOps 现状描述与已知差距口径
- **更新**: `docs/tools/TOOLS-DESIGN.MD`，明确当前仅有 5 类工具 `kind`，K8s 管理通过 builtin 暴露
- **更新**: `README.MD` 与 `nodejs/README.MD`，使架构说明、目录结构与 Node 版本要求对齐当前实现
- **更新**: `docs/verification/DESIGN-REALITY-GAP-20260305.MD`，补充“基线快照”说明，避免将历史报告误读为最新事实

### 🧭 运维 / 研发主入口收敛（2026-03-06）

- **新增**: `GET /api/runtime-status` 与 `GET /api/me/context`，统一暴露运行态、工作模式、业务范围与工具可见性
- **新增**: `GET /api/me/session`，暴露当前会话摘要、工作记忆与最近消息
- **新增**: `GET /api/me/access-matrix`，暴露当前用户的业务范围、工具可见性、K8s 集群来源与授权建模局限
- **新增**: `nodejs/bin/de.js` 最小 CLI，支持 `whoami`、`ctx show`、`access show`、`session show`、`ask`、`audit list`
- **重构**: 首页改为任务导向工作台，突出 `Chat + CLI` 主路径，弱化“功能展厅”叙事
- **重构**: `chat.html` 改为运维 / 研发对话工作台，前置上下文、工作模式与常用起手问题
- **重构**: `chatops.html` / `chatops.js` 增加运行态说明与关闭态禁用逻辑，避免能力关闭时仍表现为可交互页面
- **增强**: 统一页面 `favicon`、标题语义与 `Chat` 会话恢复横幅，减少首次进入时的状态歧义
- **新增**: `docs/verification/PRODUCT-ENTRY-BASELINE-20260306.MD`，固化当前产品化基线与未过线问题

### 🧹 后台管理能力收敛（2026-02）

- **ChatOps 关闭**: `CHATOPS_ENABLED` 默认为 `false`（需显式设 `true`/`1` 才开启），首页/导航已移除 ChatOps 入口
- **模型管理移除**: 侧栏「模型管理」Tab 及全部面板/JS 逻辑已移除（模型由环境变量 `BK_LLM_MODEL` 统一配置）
- **系统设置清理**: 空壳表单（默认模型下拉、最大Token、Temperature、日志级别）已移除，替换为「系统信息」展示（版本/状态/运行时间/当前用户/LLM 模型/路由状态）
- **设计文档**: `docs/design/CHATOPS-INTENT-DESIGN.MD` — 意图问题诊断、问句/指令一阶分类与回归矩阵方案、下线选项说明
- **后台保留能力**: 运营概览、专家管理、工具管理、MCP 服务、权限管理（角色/用户/策略）、操作日志（工具审计/LLM日志）、用户反馈、可观测性、学习闭环、任务调度

### 📊 P3/P4/P5 核心能力交付（2026-02-26）

- **P3 完结**: 统一执行器治理、Agent Loop 内核、自动学习闭环、任务调度、可观测平台全部完成
- **P4-1**: Agent Loop 接入真实 LLM（`/api/chat` 和企微入口均注入 `generateReply`）
- **P4-2**: 关键链路指标埋点（HTTP 请求、工具执行、Agent 循环、知识检索、学习抽取 5 处自动采集）
- **P4-3**: Agent 工具链路增强（observe 注入上轮工具结果支持多轮推理）
- **P5-1**: Agent 知识增强回答（answer 步骤自动检索知识库注入 LLM 上下文）
- **P5-2**: Agent → Learning Loop 闭环（对话完成后自动触发知识抽取）
- **修复**: `deploy-remote.sh` 路径 bug（`/scripts/null` → `/dev/null`）
- **修复**: Admin UI 治理看板字段映射错误（`agents.loops` → `agents.loopRuns`）
- **清理**: 根目录 8 个散乱临时测试文件
- **验证**: 全量 556/556 单测 + 5/5 Playwright 浏览器验收全部通过

### 🧹 一键验收产物收敛入口（2026-02-26）

- **新增**: `scripts/test/verify-prune.sh`，统一执行 `docs/verification` 滚动保留清理（含成对 MD/JSON 清理）
- **新增**: `make verify-prune` 入口，支持 `DRY_RUN=1` 预览模式
- **增强**: `make verify-local` 与 `make verify-browser` 默认在成功后自动触发 `verify-prune`（支持 `VERIFY_AUTO_PRUNE=0` 与 `VERIFY_PRUNE_DRY_RUN=1`）
- **更新**: `docs/verification/VERIFICATION.MD` 补充收敛命令用法，形成“规则 + 执行入口”闭环

### 🧾 TODO 文档口径校准（2026-02-26）

- **更新**: `TODO.MD` 将“未开始”章节更名为“已完成（本轮）”，避免状态语义误导
- **修正**: 任务调度验收口径与代码实现对齐（`cron/interval/event/once`）
- **修正**: 历史里程碑报告路径指向 `docs/verification/ARCHIVE/` 归档目录

### 📘 README 与待办口径对齐（2026-02-26）

- **修正**: `README.MD` 删除本地 Docker/K8s 发布路径，统一为远端 K8s 部署入口（`make deploy*` / `nodejs/scripts/deploy-remote.sh`）
- **补充**: 路线图章节新增 P3/P4/P5 状态快照（P4 当前待 `P4-4` 远端部署验收）
- **更新**: `README.MD` 文档更新时间同步到 `2026-02-26`

### 🧼 验收产物滚动规则补强（2026-02-26）

- **清理**: 再次收敛超上限滚动报告（`LOCAL-VERIFY`、`BROWSER-REGRESSION`、`CHATOPS-PARSE-MATRIX`）与旧 `BROWSER-LIVE` 快照
- **补齐规则**: `BROWSER-LIVE-*.json` 改为仅保留最新 1 份
- **补齐规则**: `EXPERT-DIAGNOSIS-ENTRY-*.JSON` 与 `BROWSER-P3-POLICY-*.JSON` 各仅保留最新 3 份
- **同步**: `AGENTS.MD` 与 `docs/verification/VERIFICATION.MD` 同步新增规则，避免新增产物再次失控

### 🗂️ 验证目录结构收敛（2026-02-26）

- **迁移**: 将历史里程碑/阶段报告与交接文档迁移到 `docs/verification/ARCHIVE/`（含 M1/I3/FULL-TEST-RUN/交接与专项历史报告）
- **新增**: `docs/verification/ARCHIVE/README.MD`，统一说明归档范围与使用约定
- **更新**: `docs/DOCS-INDEX.MD` 验证区入口，改为“主目录滚动报告 + 归档索引”结构
- **更新**: `AGENTS.MD` 与 `docs/verification/VERIFICATION.MD` 增加归档目录规则，明确主目录保留边界
- **更新**: `docs/verification/LIVE-RUN-STATUS.MD` 报告清单改为“主目录滚动 + 归档索引”说明，避免失效路径

### 🧹 验证文档瘦身清理（2026-02-26）

- **清理**: `docs/verification/` 自动产物共 77 份（旧 `LOCAL-VERIFY` / `BROWSER-REGRESSION` / `CHATOPS-PARSE-MATRIX` / `FULL-TEST-RUN`）
- **保留策略生效**:
  - `LOCAL-VERIFY-*.MD` 保留最新 5 份
  - `BROWSER-REGRESSION-*.MD/.JSON` 保留最新 6 份
  - `CHATOPS-PARSE-MATRIX-*.MD/.JSON` 保留最新 3 份
  - `FULL-TEST-RUN-*.MD` 保留最新 5 份
- **更新**: `AGENTS.MD` 与 `docs/verification/VERIFICATION.MD` 同步以上滚动保留规则，防止再次膨胀

### 🧠 ChatOps 混合识别 V1（2026-02-26）

- **增强**: `chatops-parser` 增加输入归一化层（同义词与常见错别字纠正），降低“关键词严格匹配”导致的边界漏识别
- **增强**: 引入能力层判定（read/write/diagnosis），低置信度请求优先返回能力导向澄清，而非通用“未识别”兜底
- **增强**: 对归一化纠正结果返回 `warning`，便于前端与测试确认“原句 -> 归一化句”路径
- **修复**: 补齐“列表”读意图触发词，`工具列表` 等短句不再误落到通用兜底
- **验证**:
  - `npm test -- --runInBand src/services/__tests__/chatops-parser.test.ts` 通过（140/140）
  - API 复验：`工县列个表` -> `工具列表`（带纠正 warning）并返回真实工具列表

### 🧪 ChatOps 自动扰动回放门禁（2026-02-26）

- **增强**: `test-chatops-parse-api-matrix.js` 新增自动扰动样本扩增（错别字/口语/标点/语序轻变体），不依赖人工逐条补 case
- **增强**: 新增鲁棒性种子集（读查询/注册/删除/角色绑定），每个种子自动生成多条变体并复用预期断言
- **修复**: `chatops-parser` 增加 `删掉/删` 与 `脚色` 等口语/错词归一化与解析支持
- **验证**:
  - `npm test -- --runInBand src/services/__tests__/chatops-parser.test.ts` 通过（142/142）
  - `BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN=*** node scripts/test/test-chatops-parse-api-matrix.js` 通过（119/119）

### 🖥️ 浏览器扰动门禁接入（2026-02-26）

- **增强**: `scripts/test/test-browser-regression.js` 新增 `PathG`，在 ChatOps UI 中验证错词/口语输入端到端链路（读查询、删除动作、缺参引导）
- **增强**: `scripts/test/test-browser-regression.sh` 报告模板新增“路径G 口语/错词鲁棒性”章节
- **验证**: `make verify-browser PORT=3000 BASE_URL=http://127.0.0.1:3000 HEADLESS=1 AUTH_TOKEN=***` 通过（PathA~PathG PASS）

### 🧭 ChatOps 前端降级误导修复（2026-02-26）

- **修复**: `nodejs/static/chatops.js` 在 `/api/admin/chatops/parse` 失败时，不再直接回落到“我没完全识别你的管理意图”误导文案
- **调整**: 降级路径优先展示后端真实错误（如 token/连通性失败），并仅在可解析写动作时执行本地降级解析
- **增强**: 对“查看工具列表”等只读查询在离线降级时给出明确提示（需后端在线返回实时数据）
- **验证**: `node --check nodejs/static/chatops.js` 通过；`make verify-browser PORT=3100 BASE_URL=http://127.0.0.1:3100 HEADLESS=1 AUTH_TOKEN=***` 通过（PathA~PathF PASS）

### 🧯 ChatOps 注册可见性矛盾修复（2026-02-26）

- **修复**: “注册工具成功，但查看工具列表为空”的矛盾行为
- **根因**: `tool.register` 默认写入空 `executorConfig`，`kubectl/shell/script/skill` 等执行器在运行时转换可失败并被跳过
- **调整**: `chatops-parser` 对 `tool.register` 补齐执行器默认配置（例如 `kubectl` 默认 `commandTemplate=get pods -A`）
- **调整**: 新增“为什么我注册成功了又没有工具”诊断引导，避免误导为“缺少工具名/执行器”
- **验证**:
  - `npm test -- --runInBand src/services/__tests__/chatops-parser.test.ts` 通过（137/137）
  - API 实测：`注册工具 kctl executor=kubectl` 后 `查看工具列表` 返回 `当前可用工具共 1 个：kctl (kubectl)`

### 🧭 ChatOps 回放集扩容与失败分层报告（2026-02-26）

- **增强**: `test-chatops-parse-api-matrix.js` 支持从种子矩阵自动扩展为 50+ 场景（本轮 98 条）
- **增强**: 新增失败分层维度（`api-contract` / `intent-routing` / `action-extraction` / `guide-fallback`）
- **增强**: 回放结果自动落盘 `docs/verification/CHATOPS-PARSE-MATRIX-*.JSON/.MD`，支持失败分层复盘
- **修复**: 半结构化 `role=admin unbind_tools=...` 匹配歧义（避免误命中 `bind_tools`）
- **修复**: `verify-local` 静态页面检查改为显式透传 `BASE_URL` 参数，避免非 3000 端口误失败
- **验证**: `BASE_URL=http://127.0.0.1:3000 AUTH_TOKEN=*** node scripts/test/test-chatops-parse-api-matrix.js` 通过（98/98）
- **验证**: `make verify-local-smoke AUTH_TOKEN=*** VERIFY_PROFILE=local-fast PORT=3100 BASE_URL=http://127.0.0.1:3100` 通过（PASS=6，FAIL=0）
- **验证**: `make verify-browser PORT=3100 BASE_URL=http://127.0.0.1:3100 HEADLESS=1 AUTH_TOKEN=***` 通过（PathA~PathF PASS）

### 🧪 ChatOps API 回放与多动作浏览器门禁（2026-02-26）

- **新增**: `scripts/test/test-chatops-parse-api-matrix.js` 与 `scripts/test/chatops-parse-api-matrix.json`，对 `/api/admin/chatops/parse` 执行批量回放验证
- **增强**: `verify-local-baseline.sh` 的 `chatops_guard` 接入 API 回放矩阵（提供 `AUTH_TOKEN` 时强制执行）
- **增强**: 浏览器回归新增 `PathF`（复合句多动作预览），覆盖“单轮多动作”对话场景
- **修复**: “执行模式切换为 advice-only; 开启自动路由”仅解析单动作的问题，补齐执行模式语序兼容
- **验证**: `npm test -- --runInBand src/services/__tests__/chatops-parser.test.ts` 通过（135/135）
- **验证**: `make verify-local-smoke AUTH_TOKEN=*** VERIFY_PROFILE=local-fast` 通过（PASS=6，FAIL=0）
- **验证**: `make verify-browser HEADLESS=1 AUTH_TOKEN=***` 通过（PathA~PathF PASS）

### 🧱 ChatOps 对话矩阵与门禁重构（2026-02-26）

- **增强**: `chatops-parser.test.ts` 升级为 100+ 对话样本矩阵（本轮 135 条断言），覆盖写意图缺参、自由语序、读意图兜底等关键回归面
- **增强**: `verify-local-baseline.sh` 的 `chatops_guard` 步骤接入 parser 矩阵单测，ChatOps 解析回归失败会阻断本地验收
- **增强**: 浏览器回归 `PathB` 扩展为双断言（读意图 + 写意图缺参），降低“只测读不测写”的漏检风险
- **修复**: 角色工具移除语句优先匹配 `role.unbind`，避免误落到 `tool.delete`
- **修复**: 新增“用户 <id> 移除角色 <role>”语序解析，补齐用户角色管理自然语言覆盖
- **修复**: token 趋势/最近意图判定收敛，避免“token 概览”误分流导致兜底
- **验证**: `npm test -- --runInBand src/services/__tests__/chatops-parser.test.ts` 通过（135/135）
- **验证**: `make verify-local-smoke AUTH_TOKEN=*** VERIFY_PROFILE=local-fast` 通过（PASS=5，FAIL=0）

### 🧪 ChatOps 对话鲁棒性与门禁补强（2026-02-26）

- **修复**: `chatops-parser` 不再将“注册”默认识别为 `mcp`，避免工具管理意图误分类
- **增强**: 新增“工具注册缺参数”定向引导（缺工具名/缺执行器），替代通用“未识别”兜底文案
- **增强**: 支持中文自由语序注册表达（示例：`注册一个 kctl kubectl 工具`）
- **增强**: 浏览器回归 `PathB` 升级为双断言：同时覆盖“工具列表读意图”与“工具注册缺参写意图”
- **验证**: `npm test -- --runInBand src/services/__tests__/chatops-parser.test.ts` 通过（18/18）
- **验证**: `make verify-browser HEADLESS=1 AUTH_TOKEN=***` 通过（PathA~PathE PASS，含“注册一个 kubectl 工具吧”断言）

### 🛠️ P3 浏览器回归默认端口稳定性修复（2026-02-26）

- **修复**: `local-up-bg` 在后台启动时显式传递 `PORT=$APP_PORT`，避免 `PORT` 为空值传入子进程
- **修复**: `scripts/test/test-browser-regression.sh` 增加 `BASE_URL/health` 就绪等待，降低页面初始化阶段接口抢跑导致的偶发失败
- **验证**: `make verify-browser HEADLESS=1 AUTH_TOKEN=***` 通过（默认 3000，PathA~PathE PASS）
- **验证**: `make verify-browser PORT=3100 BASE_URL=http://127.0.0.1:3100 HEADLESS=1 AUTH_TOKEN=***` 通过（PathA~PathE PASS）
- **验证**: `make verify-local-browser VERIFY_PROFILE=local-fast AUTH_TOKEN=***` 通过（PASS=3, FAIL=0）

### 🧭 P3 浏览器回归入口参数协同收口（2026-02-26）

- **增强**: `verify-browser` / `verify-local` 入口显式透传 `PORT`，与 `BASE_URL` 协同支持自定义端口回归
- **增强**: `scripts/test/test-browser-regression.sh` 调用 `make local-restart-bg` 时透传 `PORT`，避免子进程回退默认端口
- **增强**: `scripts/test/verify-local-baseline.sh` 在 boot 与 browser 阶段透传 `PORT`，保持统一验收入口参数一致
- **验证**: `make verify-browser PORT=3100 BASE_URL=http://127.0.0.1:3100 HEADLESS=1 AUTH_TOKEN=***` 通过（PathA~PathE PASS）
- **验证**: `make verify-local-browser PORT=3100 BASE_URL=http://127.0.0.1:3100 VERIFY_PROFILE=local-fast AUTH_TOKEN=***` 通过（PASS=3, FAIL=0）
- **风险（已收敛）**: 默认 3000 场景 `TypeError: fetch failed` 已在本日后续修复（见上方“默认端口稳定性修复”）

### 🧩 设计与待办对齐补充（2026-02-25）

- **更新**: `TODO.MD` 新增 4 项 P3 待办：Agent Loop 内核补齐、任务调度系统落地、可观测平台集成（可选）、运维与审计指标看板
- **更新**: `docs/roadmap/ROADMAP.MD` 远期目标补充以上能力，确保与技术设计文档一致
- **目的**: 修复“设计文档有明确工作项但 TODO 未映射”的规划缺口

### 🔐 I0-2 安全配置契约收口（2026-02-25）

- **收口**: 敏感配置在缺少 `MCP_SECRET_KEY` 时拒绝写入，防止明文落库
- **收口**: `mcp_servers.api_key` 与 `raw_config` 中敏感字段采用统一加密存储
- **收口**: 审计日志统一使用脱敏输出，避免敏感值明文进入日志
- **验证**: `npm test -- --runInBand src/services/__tests__/secret-crypto.test.ts src/services/__tests__/audit-redaction.test.ts src/services/__tests__/mcp-config-manager.test.ts` 通过（6/6）

### 📄 I0-3 统一验收报告模板落盘（2026-02-25）

- **收口**: `scripts/test/verify-local-baseline.sh` 输出统一模板，固定包含“验收目标/环境信息/执行步骤与证据/结果判定/失败项/建议动作”
- **验证**: `VERIFY_STAGE=quick VERIFY_PROFILE=local-fast make verify-local` 通过并生成标准报告
- **产物**: `docs/verification/LOCAL-VERIFY-20260225-182834-99392.MD`
- **治理**: `docs/verification/LOCAL-VERIFY-*.MD` 滚动保留最新 5 份

### 💬 I1-1 ChatOps 自由输入解析增强（2026-02-25）

- **收口**: 解析链路覆盖自然语言、JSON-like、半结构化输入并统一归一为标准 actions
- **补强**: 新增半结构化输入定向单测（`role=admin bind_tools=query_metrics,query_alerts`）
- **验证**: `npm test -- --runInBand src/services/__tests__/chatops-parser.test.ts` 通过（10/10）

### 🔁 I1-2 管理动作闭环收口（2026-02-25）

- **收口**: `parse -> preview -> confirm -> execute -> audit` 链路定向验收通过
- **验证**: `npm test -- --runInBand src/services/__tests__/admin-action-manager.test.ts src/routes/__tests__/admin.test.ts` 通过（46/46）
- **说明**: 本轮以闭环复验为主，无新增实现改动

### 🔐 I1-3 安全配置全入库（2026-02-25）

- **补强**: 增加 `mcp-config-manager` 定向测试，覆盖 `apiKey` 与 `raw_config` 敏感字段写入加密
- **补强**: 增加扩展字段持久化/回读测试，确保后续扩展字段可兼容
- **验证**: `npm test -- --runInBand src/services/__tests__/mcp-config-manager.test.ts` 通过（5/5）

### 🛡️ I1-4 错误模型统一复验（2026-02-25）

- **复验**: 核心路由与服务错误模型统一性（`DomainExpertError`）定向通过
- **验证**: `npm test -- --runInBand src/routes/__tests__/mcp.test.ts src/services/__tests__/llm.test.ts` 通过（30/30）
- **说明**: 本轮为一致性验收，无新增实现改动

### 🧩 I2-1 连续对话场景库验收（2026-02-25）

- **补强**: 新增 `conversation-scenarios` 定向测试，覆盖“目标变更/追问/中断恢复”三类场景
- **验证**: `npm test -- --runInBand src/services/__tests__/conversation-scenarios.test.ts` 通过（3/3）
- **范围**: 本轮仅 API/Web 场景库，不接企微链路

### 🧠 I2-2 三层记忆能力复验（2026-02-25）

- **补强**: 新增 `memory-evidence` 定向测试，覆盖短期/工作/长期记忆证据链
- **验证**: `npm test -- --runInBand src/services/__tests__/memory-evidence.test.ts` 通过（2/2）
- **结果**: 检索命中与记忆槽位可追踪，满足三层记忆复验基础门禁

### 🗣️ I2-3 对话体验收敛验收（2026-02-25）

- **补强**: 新增 `conversation-quality` 定向测试，覆盖“10 轮阈值 + 可执行表达”门禁
- **验证**: `npm test -- --runInBand src/services/__tests__/conversation-quality.test.ts` 通过（2/2）
- **结果**: 对话质量评估具备可追溯证据，可支撑 I2 体验收敛验收

### 🧪 I3-1 一致性修复（失败诊断续接，2026-02-25）

- **修复**: 管理动作执行失败信息保留详细原因（`<action> failed: <reason>`），避免仅返回泛化失败文案
- **修复**: ChatOps 在“为什么失败/失败原因”追问时，自动读取最近失败审计并返回“原因 + 建议下一步”
- **修复**: 企微命令入口支持“失败原因诊断”，与 API 入口对齐返回失败原因与建议动作
- **验证**: `npm test -- --runInBand src/services/__tests__/chatops-parser.test.ts src/services/__tests__/admin-action-manager.test.ts src/services/__tests__/wecom-commands-admin-diagnosis.test.ts src/routes/__tests__/mcp.test.ts` 通过（36/36）
- **报告**: `docs/verification/I3-1-ENTRY-CONSISTENCY-20260225.MD`

### 🛡️ I3-2 稳定性治理补强（2026-02-25）

- **增强**: `mcp-client` 在异常场景返回 `suggestion`，覆盖 timeout/熔断/鉴权/5xx/协议异常等降级建议
- **增强**: MCP 路由透传 `suggestion` 字段，前端/调用方可直接消费执行建议
- **验证**: `npm test -- --runInBand src/routes/__tests__/mcp.test.ts src/services/__tests__/wecom-commands-admin-diagnosis.test.ts src/services/__tests__/chatops-parser.test.ts src/services/__tests__/admin-action-manager.test.ts` 通过（36/36）
- **报告**: `docs/verification/I3-2-RESILIENCE-20260225.MD`

### 📊 I3-3 全量回归与报告标准化（2026-02-25）

- **修复**: `single-agent-mode` 测试去除外部 LLM 依赖，降低离线回归波动
- **增强**: `test-mcp-local.sh` 增加 curl 重试，降低瞬时网络抖动导致的误失败
- **验证**: `AUTH_TOKEN=*** API_TIMEOUT_SEC=10 CONNECT_TIMEOUT_SEC=2 STEP_TIMEOUT_SEC=180 STEP_STALL_SEC=90 make verify-local VERIFY_STAGE=all VERIFY_PROFILE=ci` 通过（PASS=7, FAIL=0）
- **产物**: `docs/verification/LOCAL-VERIFY-20260225-185639-47509.MD`
- **治理**: `LOCAL-VERIFY-*.MD` 保留策略已收敛为最新 5 份

### 🧭 ChatOps 全量对话管理设计固化（2026-02-25）

- **更新**: `docs/design/TECHNICAL-DESIGN.MD` 将 AdminAction 集合从最小集升级为当前全集（含 role/user/model 新动作）
- **新增**: `3.2.3 ChatOps 全量管理 API 对话映射（定版）`，明确读写分流、管理域覆盖矩阵与失败诊断约束
- **新增**: 防遗漏机制（新增管理 API/动作时，必须同步语义映射 + 回归用例 + 文档矩阵）
- **新增**: `scripts/test/check-chatops-coverage.sh` 轻量守门脚本，并接入 `make verify-local`（quick 模式除外）

### 🚀 浏览器全链路回归与读意图性能收敛（2026-02-25）

- **优化**: `listAllTools` 引入 MCP 自动发现超时降级（默认 2500ms），避免“当前工具有什么”读意图被远端发现阻塞
- **优化**: ChatOps 工具列表读意图调用使用更短发现窗口（1200ms），优先保障对话响应
- **新增**: `scripts/test/test-browser-regression.js` 与 `scripts/test/test-browser-regression.sh`，覆盖 MCP 删除 + ChatOps 读意图 + 失败追问上下文
- **新增**: `make verify-browser` 一键执行完整浏览器回归并生成 `docs/verification/BROWSER-REGRESSION-*.MD/.JSON` 报告
- **增强**: `verify-local` 新增 `VERIFY_STAGE=browser`，并支持 `VERIFY_PROFILE=ci` 下默认启用浏览器回归（`RUN_BROWSER_E2E=1`）
- **增强**: `Makefile` 新增 `make verify-local-browser`，统一复用 `verify-local` 报告模板执行浏览器阶段
- **增强**: `chatops.js` 新增“待确认会话自动续接”，页面刷新后会自动恢复最近 pending 会话
- **增强**: 浏览器回归新增 PathD（待确认会话自动续接）并纳入 `make verify-browser` / `make verify-local-browser`
- **增强**: 新增后端接口 `GET /api/admin/actions/pending-session`，前端自动续接不再依赖审计推断，恢复逻辑更稳定
- **补测**: `src/routes/__tests__/admin.test.ts` 增加 pending-session 路由用例；`src/services/__tests__/admin-action-manager.test.ts` 增加最近 pending 会话查询用例
- **验证**: `VERIFY_STAGE=browser VERIFY_PROFILE=ci RUN_BROWSER_E2E=1 make verify-local` 通过（PASS=3, FAIL=0）
- **验证**: `make verify-local-browser AUTH_TOKEN=***` 通过（PASS=3, FAIL=0）
- **验证**: `make verify-browser HEADLESS=1` 通过（PathA/PathB/PathC/PathD 全 PASS）

### 🧭 P3 统一执行器治理（超时策略第一批，2026-02-25）

- **新增**: `tools/execution-policy.ts`，统一按风险级别解析执行超时（read/write/high-risk）
- **增强**: `shell/script/kubectl/skill` 执行器由硬编码超时切换为统一策略（仍支持专项环境变量覆盖）
- **增强**: 工具调用审计元数据新增 `riskLevel/timeoutMs`，便于跨执行器回放与排障
- **增强**: `/api/admin/tools` 返回新增 `timeoutMs` 字段，前端可直接展示当前执行预算
- **增强**: 管理后台“工具管理”列表新增“超时预算”列与风险提示文案，详情弹窗展示 `timeoutMs`
- **增强**: 浏览器回归新增 PathE（控制台错误 + 关键网络请求断言），失败自动截图落盘 `docs/verification/BROWSER-REGRESSION-*.PNG`
- **新增**: `docs/verification/LIVE-RUN-STATUS.MD` 实时执行状态面板，持续展示“当前开发项 + 最近验证 + 下一步”
- **补测**: 新增 `src/services/tools/__tests__/execution-policy.test.ts`
- **验证**: `npm test -- --runInBand src/routes/__tests__/admin.test.ts src/services/tools/__tests__/execution-policy.test.ts src/services/tools/executors/__tests__/skill.test.ts src/services/tools/executors/__tests__/kubectl.test.ts` 通过（51/51）
- **验证**: `scripts/test/test-static-pages.sh` 通过（8/8）
- **验证**: `make verify-browser HEADLESS=1` 通过（PathA/PathB/PathC/PathD/PathE 全 PASS）

### 🤖 三角色子代理开发方案（2026-02-25）

- **新增**: Project Skill `.cursor/skills/subagent-driven-development-3role/SKILL.md`
- **新增**: 三角色提示词模板（`DOC-ROLE-PROMPT.MD` / `DEV-ROLE-PROMPT.MD` / `TEST-ROLE-PROMPT.MD`）与主控检查清单（`ORCHESTRATION-CHECKLIST.MD`）
- **新增**: `docs/tools/SUBAGENT-DRIVEN-DEVELOPMENT-3ROLE.MD`，沉淀“文档/开发/测试”协作流程与门禁规则
- **更新**: `docs/DOCS-INDEX.MD` 增加三角色子代理方案入口
- **归档**: `docs/verification/DEV-TEST-HANDOFF.MD` 迁移为 `docs/verification/DEV-TEST-HANDOFF-ARCHIVE-20260225.MD`
- **更新**: `docs/DOCS-INDEX.MD` 的验证区入口改为归档文档并标注“已停用”

### 🧾 文档时效与口径收敛（2026-02-25）

- **更新**: `CHANGELOG.MD` 文末“最后更新”时间，统一到当前迭代日期
- **更新**: `docs/DOCS-INDEX.MD` 中 M1 报告描述，移除“本轮”表述并改为稳定里程碑口径
- **更新**: `LOCAL-DEV-GUIDE.MD` / `DEPLOYMENT-GUIDE.MD` / `docs/security/SECRET-MANAGEMENT.MD` 增加“现行口径说明”
- **修正**: 文档中的部署脚本和路径表达（远端部署脚本路径、远端临时文件路径占位符）
- **说明**: `DEPLOYMENT-GUIDE.MD` 附录中的时间字段标注为“历史记录”，避免与文首版本时间冲突
- **清理**: `docs/verification/LOCAL-VERIFY-*.MD` 重新收敛到“仅保留最新 5 份”
- **统一**: 全仓 Markdown 中旧路径 `scripts/deploy/deploy-remote.sh` 统一替换为 `nodejs/scripts/deploy-remote.sh`

### 🧭 规划文档对齐（2026-02-25）

- **更新**: `README.MD` 路线图为 Iteration 0~3 统一口径，并同步最后更新时间
- **更新**: `docs/design/TECHNICAL-DESIGN.MD` 增加“Phase 为历史规划、当前以 Iteration 计划为准”的执行声明
- **更新**: `docs/verification/VERIFICATION.MD` 新增“验收标准索引（按 Iteration）”，统一验收入口检索
- **精简**: `docs/design/TECHNICAL-DESIGN.MD` 移除历史周计划/FAQ 尾部内容，改为“历史附录说明”，减少与当前执行计划冲突
- **精简**: `docs/design/TECHNICAL-DESIGN.MD` 第 8 章改为“设计摘要 + 角色表”，删除大段重复示例与静态配置样例
- **精简**: `docs/design/TECHNICAL-DESIGN.MD` 的智能协调/用户体验/实现要点/扩展性章节改为“契约与规则摘要”，移除实现级伪代码

### 🧹 验收报告滚动保留（2026-02-25）

- **清理**: `docs/verification/LOCAL-VERIFY-*.MD` 历史报告，仅保留最新 5 份
- **新增规则**: `AGENTS.MD` 增加本地验收报告“滚动保留 5 份”约束
- **更新**: `docs/verification/VERIFICATION.MD` 增加“验收报告保留策略”章节
- **修正**: `docs/verification/VERIFICATION.MD` 中 K8s/部署脚本链接为有效相对路径

### 🧾 文档治理补齐（2026-02-25）

- **更新**: `docs/verification/PROGRESS-REPORT.MD`，将“最新进展”同步到 Iteration 0~1 当前状态
- **修正**: 进展报告中的过期内容与旧结论，统一为当前阶段目标、风险与下一步
- **收敛**: 文档口径统一到 `TODO.MD` + `docs/verification/ITERATION-PLAN.MD` + `docs/roadmap/ROADMAP.MD`

### 🧹 移除 Cursor 插件能力（2026-02-25）

- **移除**: `cursor-plugin/` 目录及相关实现文件，统一收敛为 MCP 接入路径
- **更新**: `README.MD`，删除“安装 Cursor 插件”说明与目录结构中的插件条目
- **更新**: `docs/design/TECHNICAL-DESIGN.MD`，移除消息入口中的“Cursor 插件”描述
- **说明**: 交付入口保持为 `mcp-config.json` + Cursor MCP 集成方案

### 🗺️ 路线图口径对齐（2026-02-25）

- **更新**: `docs/roadmap/ROADMAP.MD`，从“抽象近期/中期/远期”重构为“战略主线 + 迭代映射（Iteration 0~3）”
- **对齐**: 与 `docs/verification/ITERATION-PLAN.MD` 和根目录待办清单保持一致，避免优先级理解偏差
- **补充**: 增加关联文档到迭代计划与验证进展，提升路线图可追踪性
- **更新**: `docs/DOCS-INDEX.MD` 中路线图说明，改为“战略主线与迭代映射”，与路线图正文保持一致

### 📚 ECC Skills 中文总览文档（2026-02-25）

- **新增**: `docs/tools/ECC-SKILLS-OVERVIEW.MD`，提供 Everything-Claude-Code Skills 的中文分类说明、场景化组合与项目优先推荐清单
- **更新**: `docs/DOCS-INDEX.MD`，补充 ECC Skills 中文总览入口，提升工具文档可检索性

### 📌 迭代计划重排与文档落地（2026-02-25）

- **重排**: `TODO.MD` 按 Iteration 0~3 重构优先级与依赖关系，新增统一完成定义（DoD）与验收口径
- **新增**: `docs/verification/ITERATION-PLAN.MD`，明确三阶段交付范围、验收标准、发布门禁
- **新增**: `docs/tools/MCP-SKILLS-TOOLKIT.MD`，沉淀 MCP/Skills 选型建议与迭代映射
- **更新**: `docs/DOCS-INDEX.MD`，补充以上新文档入口，保证索引可检索
- **目标**: 形成“先利其器 -> 功能开发 -> 全链路验收”的执行闭环

### 🧹 文档清理（低风险无引用项）

- **删除**: `docs/CHATOPS-PAGE-DEPLOYED.md`（历史状态说明，未被索引且无引用）
- **删除**: `docs/DESIGN-HIGHLIGHTS-BRIEF.MD`（历史宣传型文档，未被索引且无引用）
- **说明**: 本次仅清理“无引用 + 不在文档索引 + 对当前迭代无直接价值”的文件，避免误删

### 🧪 本地验收统一入口（I0-1）

- **新增**: `scripts/test/verify-local-baseline.sh`，统一执行本地健康检查、离线回归、脚本级验证并输出报告
- **新增**: `make verify-local`，支持可选 `AUTH_TOKEN` 执行鉴权相关检查
- **输出**: 报告默认落盘到 `docs/verification/LOCAL-VERIFY-<timestamp>.MD`

### 🔧 验收脚本阻塞修复

- **修复**: `scripts/test/test-mcp-local.sh` 为关键 `curl` 请求增加连接与请求超时（`--connect-timeout 3 --max-time 10`）
- **效果**: 避免带 token 验收时因单接口慢响应导致整套本地验收长时间阻塞
- **增强**: `make verify-local` / `scripts/test/verify-local-baseline.sh` 新增分阶段执行（`quick/smoke/tests/auth/all`）
- **新增**: `make verify-local-quick` / `make verify-local-smoke` / `make verify-local-tests` / `make verify-local-auth`
- **效果**: 支持“小步快跑”验收，减少长时间阻塞并提升过程可见性

### 📐 协同执行纪律固化

- **更新**: `AGENTS.MD` 新增“执行与验收纪律（长期生效）”章节
- **原则**: 先修复阻塞再推进；阶段验收通过后再进入下一阶段；长任务可视化执行并持续同步进度
- **目标**: 确保交付物以“可用版本”为标准，避免临时方案在后续阶段遗忘和累积风险

### 🧹 管理模型简化（硬删除能力/实现/武器库）

- **移除**: 废弃的能力/实现/武器库三层模型相关后端 API 与服务代码（`capability.*`、`tool-implementation.*`、`agent-arsenal.*`）
- **移除**: 数据库废弃表 `admin_capabilities` / `admin_tool_implementations` / `admin_agent_arsenal_bindings`（迁移中执行 `DROP TABLE IF EXISTS`）
- **移除**: Admin 控制台中对应“能力定义/武器实现/武器库绑定”三个面板与模态框，避免再调用已下线 API
- **保留**: 动态工具目录 + 角色/用户授权 + Agent 画像（单层工具治理）
- **测试**: `npm run build`、`npm test -- --runInBand src/routes/__tests__/admin.test.ts src/routes/__tests__/mcp.test.ts` 通过

### 🔧 ChatOps / MCP / 模型路由收敛修复

- **修复**: MCP 列表读取按 `updated_at DESC` 排序，管理台优先展示最近变更的服务
- **修复**: ChatOps `parse` 请求写入 `llm_call_log`（`requestType=chatops`），后台可直接检索输入与解析结果
- **修复**: 模型选择优先级调整为 `explicit > task routing > agent mapping > default`，任务路由规则优先于 Agent 静态映射
- **修复**: BaseAgent 调用 LLM 透传 `userId/sessionId/requestType/taskType`，路由与日志字段完整
- **修复**: `Orchestrator` 执行阶段不再硬编码 `task.type='query'`，改为沿用分析结果，确保模型任务路由可命中
- **优化**: Admin 模型管理页保存任务映射时自动开启 `autoRouting`
- **优化**: ChatOps 确认结果文案明确区分“未执行（advice-only）”

### 🔐 MCP 凭据安全增强

- **新增**: `MCP_SECRET_KEY` 配置项，用于 MCP 凭据加密
- **新增**: `secret-crypto` 服务（AES-256-GCM），支持 `enc:v1` 格式加解密
- **增强**: `mcp_servers.api_key` 写入前自动加密，读取时自动解密供运行时使用
- **兼容**: 未配置 `MCP_SECRET_KEY` 时保持原行为（明文存储）并输出告警日志
- **增强**: `mcp_servers` 新增 `raw_config(JSONB)`，持久化 MCP 全量配置 JSON（含未来扩展字段）
- **增强**: `raw_config` 中敏感字段（apiKey/token/authorization 等）自动加密，运行时按需解密

### 🚀 M1 AdminAction 扩展（能力线 + 安全线并行）

- **增强**: `AdminAction DSL` 扩展为全量管理动作，新增支持 `tool.delete` / `role.bind` / `role.unbind` / `user.assign-role` / `user.remove-role` / `token.revoke` / `execution.mode.switch`
- **新增**: 策略引擎 `admin-policy-engine`，覆盖 `riskLevel + requiresApproval + allowedRoles + scope`，并默认拒绝未声明动作（deny-by-default）
- **增强**: 高风险动作二次确认机制（`确认 二次确认`）接入 `preview -> confirm -> execute`
- **新增**: 动态工具目录 `admin-tool-catalog` 与数据库表 `admin_tools`，支持管理员注册工具元数据并运行时热加载（无需重启）
- **增强**: 工具注册中心 `registry` 支持静态工具 + 动态工具合并视图，`executeTool` 运行时按名称即时解析动态工具
- **增强**: 管理后台关键写路径统一改为走同一 `AdminAction` 引擎（角色绑定/解绑、用户角色分配/移除、token 创建/吊销）
- **增强**: ChatOps 解析器覆盖更多管理意图（工具/角色/用户角色/token/执行模式）
- **测试**: 更新并通过 `chatops-parser`、`admin-action-manager`、`admin routes` 定向测试，以及 `make test-no-llm` 全量离线回归
- **验证**: 新增远程验收报告 `docs/verification/M1-ADMINACTION-E2E-20260212-230800.MD`

### 🧩 M1 下一阶段：Agent 动态武器库（能力/实现/绑定）

- **新增**: `agent-arsenal-manager`，支持 `capability` / `tool implementation` / `agent profile` / `arsenal binding` 的增删改查
- **新增**: 数据库表 `admin_capabilities` / `admin_tool_implementations` / `admin_agent_profiles` / `admin_agent_arsenal_bindings`
- **增强**: `AdminAction DSL` 扩展到 `capability.*`、`tool.implementation.*`、`agent.profile.upsert`、`agent.arsenal.bind/unbind`
- **增强**: `policy-engine` 同步接入新增动作策略，保持 deny-by-default
- **增强**: Tool Registry 支持 `agentId + capability` 运行时解析，Agent 执行上下文透传 `agentId`
- **增强**: Agent 初始化支持从动态画像与武器库装配能力和工具
- **增强**: 管理端新增能力/实现/画像/武器库绑定 API，前后端统一经由 AdminAction 引擎执行
- **测试**: 补充并通过新增 DSL 解析与 AdminAction 新动作测试；修复 `mcp` 路由断言和集成测试时延断言不稳定问题
- **验证**: 新增闭环报告 `docs/verification/M1-AGENT-ARSENAL-E2E-20260212-233736.MD`

### 🧪 M1 三层记忆验收脚本

- **新增**: `nodejs/scripts/verify-m1-memory.js`，覆盖短期记忆回注、工作记忆槽位更新、长期记忆注入与“确认自动续接”闭环
- **新增**: `npm run verify:m1-memory` 与 `make verify-m1-memory` 一键验收入口，可输出 Markdown 报告到 `docs/verification/`
- **增强**: 验收脚本在数据库不可用时输出 `BLOCKED` 报告（含阻塞原因与重试建议），避免无反馈失败
- **新增**: 验证报告样例 `docs/verification/M1-MEMORY-VERIFICATION-20260212-220110.MD`
- **修复**: `searchKnowledge` 去除对 `to_tsvector('chinese')` 的硬依赖，兼容未安装中文文本检索配置的 PostgreSQL 环境
- **新增**: 远程实测通过报告 `docs/verification/M1-MEMORY-VERIFICATION-20260212-220640.MD`（10/10 PASS）

### 🛡️ 统一错误处理（阶段一）

- **增强**: `src/services/llm.ts` 调用失败/解析异常统一为 `DomainExpertError` 并附带错误码
- **测试**: 补充 `src/services/__tests__/llm.test.ts` 覆盖 `callLLM` 错误场景

## [未发布] - 2026-02-10

### 💬 ChatOps 解析体验增强

- **新增**: 后端解析服务 `src/services/chatops-parser.ts`，统一处理自然语言、`actions` JSON、`{mcpServers:{...}}` 配置输入
- **新增**: 解析接口 `POST /api/admin/chatops/parse`，前端优先调用后端进行意图识别与动作归一化
- **增强**: 兼容“格式不规范的 mcpServers JSON-like 文本”，自动修复并转换为 `mcp.server.register` 动作
- **增强**: `chatops.js` 发送流程改为“后端解析优先 + 本地兜底”，并在界面提示自动修复结果
- **测试**: 新增 `src/services/__tests__/chatops-parser.test.ts`，补充路由测试 `src/routes/__tests__/admin.test.ts`

### 🛡️ 统一错误处理（阶段一）

- **增强**: `admin.ts` / `mcp.ts` 写操作失败分支统一使用 `DomainExpertError`，输出稳定错误码与上下文 details
- **增强**: `admin.ts` 的 `/api/admin/plan/preview` 改为 `wrapRoute + ValidationError + sendSuccess`
- **增强**: `admin.ts` 的用户工具配置查询未命中改为 `NotFoundError`（统一 404 错误结构）
- **增强**: `admin-action-manager.ts` 参数校验与执行失败分支统一使用 `ValidationError` / `DomainExpertError`
- **增强**: `services/monitor.ts` 统一使用 `DomainExpertError` / `ValidationError`，补充 BK Monitor 错误码
- **同步**: `TODO.MD` 的 P0 测试覆盖清单状态已按实际落地更新为完成（wecom/admin/mcp）

### 📄 验证报告

- **新增**: `docs/verification/PROGRESS-REPORT.MD`，固定记录最新回归结果与阶段进展
- **更新**: `docs/DOCS-INDEX.MD` 增加进展报告入口

### 📈 健康检查与可观测联动

- **增强**: `/health` 新增企微签名自检结果（`wecom.status/detail`）与 `uptime` 字段
- **增强**: `observability.js` 改为基于 `/health` 的结构化状态渲染（数据库状态字符串与企微状态统一映射）

### 🤖 ChatOps Admin 动作协议（MVP）

- **新增**: 管理动作后端服务 `admin-action-manager`，支持 `preview -> 确认 -> execute`
- **新增**: 管理接口 `POST /api/admin/actions/preview` 与 `POST /api/admin/actions/confirm`
- **新增**: `AdminAction v1` 8 类动作执行支持：`tool.register` / `tool.update` / `tool.disable` / `role.bind_tools` / `role.unbind_tools` / `mcp.server.register` / `mcp.server.update` / `token.rotate`
- **新增**: 确认会话 5 分钟有效期（超时后必须重新 preview）
- **新增**: 默认 `advice-only` 执行模式，并支持确认时 `forceExecute`
- **新增**: 多动作 `all-or-nothing` 回滚机制（执行失败自动反向补偿）
- **测试**: 新增 `src/services/__tests__/admin-action-manager.test.ts`，覆盖 advice-only、确认会话、失败回滚、过期失效
- **增强**: AdminAction 新增动作风险分级（`read` / `write` / `high-risk`），预览结果返回 `riskLevel`
- **增强**: 新增管理动作审计落库 `admin_action_audit`，覆盖 preview/advice/execute/rollback 状态（失败不阻断主流程）
- **测试**: 补充 `admin-action-manager` 单测，覆盖风险分级与审计写入调用
- **增强**: 管理控制台（`/admin`）新增 AdminAction 面板，支持动作模板、`preview -> confirm` 执行与审计日志查看
- **增强**: AdminAction 面板支持审计筛选（`sessionId/status/limit`）与“上次输入”本地回填（模板/模式/actions JSON）

### 🧠 Knowledge Embedding 接入

- **新增**: `createMemory` 接入蓝鲸 embedding 生成并写入 `memories.embedding`
- **新增**: embedding 调用服务 `src/services/embedding.ts`（模型/超时支持配置）
- **更新**: 数据库 `memories.embedding` 目标维度统一为 `vector(4096)`，兼容迁移旧维度结构
- **修复**: 知识索引器支持大写 `.MD` 文档扩展名扫描
- **测试**: 更新 `src/services/knowledge/__tests__/manager.test.ts` 覆盖 embedding 写入参数
- **增强**: 检索链路升级为“语义召回优先 + 全文检索兜底”，并保留角色/会话/领域隔离打分
- **修复**: 4096 维场景下自动跳过 `ivfflat` 索引创建，避免 pgvector 维度上限报错
- **增强**: 检索排序接入 `quality_score` 质量因子（低质量记忆降权）
- **新增**: 知识反馈接口 `submitKnowledgeFeedback` 与内置工具 `rate_knowledge`，支持反馈反哺质量分

### 🖥️ SSH 远程管理工具接入

- **新增**: `ssh_remote_management` 工具（builtin 类型），支持 list/show/test/connect/exec/upload/download
- **调整**: 系统工具改为数据库配置驱动（`tool_configs`），按 user/role 解析主机配置与密钥
- **安全**: 高风险动作默认 `advice-only`，需 `mode=execute + confirmExecute=true`
- **文档**: 新增 `docs/tools/SSH-REMOTE-MANAGEMENT-TOOL.MD`

### 🤖 Codex 远程运维命令

- **新增**: Codex 专用远程运维脚本 `scripts/tools/CODEX-REMOTE-OPS.SH`
- **新增**: Make 入口 `codex-deploy-local` / `codex-status` / `codex-health` / `codex-test-no-llm` / `codex-test-report` / `codex-exec`
- **新增**: `codex-test-report-push`，远程生成报告后自动 `git commit && git push`
- **增强**: `codex-test-report` 支持 token 自动兜底（`AUTH_TOKEN` -> 远程 `.env.secrets` 的 `ADMIN_BOOTSTRAP_TOKEN`）
- **修复**: `codex-deploy-local` 重启后健康检查增加重试等待，避免瞬时启动误报失败
- **调整**: 本地启动入口 `make local-start` / `make local-restart` 统一改为非阻塞（分别等价 `local-up-bg` / `local-restart-bg`）
- **增强**: 本地重启命令增加数据库保护提示（默认不会清理 postgres 数据卷）
- **新增**: `make local-db-reset CONFIRM_RESET_DB=YES` 显式危险入口（仅在明确确认时重置本地数据库卷）
- **文档**: 新增 `docs/tools/CODEX-REMOTE-OPS.MD`

### ☸️ Kubectl 工具类型

- **新增**: 工具系统支持 `kubectl` kind（`ToolKind`/类型导出/执行分发）
- **新增**: `kubectl` 执行器，仅允许只读子命令（默认）与 `rollout status`
- **新增**: 单元测试 `src/services/tools/executors/__tests__/kubectl.test.ts`
- **增强**: `PLAN_TOOL_KIND_MULTIPLIERS` 默认加入 `kubectl`
- **增强**: 企微“我的工具”展示增加 `kubectl` 类型图标
- **文档**: 更新 `docs/tools/TOOLS-DESIGN.MD` 的 kubectl 设计说明

### 🔐 企微“我的工具”只读

- **新增**: 企微命令层拦截工具写操作意图（新增/删除/修改/配置/启用/禁用等），统一返回“只读模式”提示
- **新增**: 引导用户到管理后台进行工具配置，避免在企微侧误触写操作
- **测试**: 增加 `wecom-commands` 单测，覆盖工具写操作只读拦截

### 🧹 文档清理

- **删除**: `docs/NGINX-CALLBACK-CHECK-REPORT.MD`（历史排查报告，避免无效文档长期留存）
- **修复**: `scripts/test/test-domain-health.sh` 失败提示中的文档路径，改为 `docs/verification/VERIFICATION.MD`

### 📝 设计文档同步

- **更新**: `docs/design/TECHNICAL-DESIGN.MD`，统一为多执行器网关（ToolSpec）、ChatOps Admin 流程与记忆策略定版
- **更新**: `docs/roadmap/ROADMAP.MD`，按当前优先级同步近期/中期/远期路线
- **更新**: 吸收 `docs/review/PROJECT-REVIEW.MD` 的关键改进点到设计与执行清单（覆盖率目标、编排拆分、高可用保护、统一错误模型）
- **更新**: `nodejs/static/README.MD` 与 `nodejs/static/three-layer-memory.html`，移除“固定条数记忆”表述，改为动态窗口/槽位化/语义召回优先
- **更新**: `docs/design/TECHNICAL-DESIGN.MD` 新增“当前定版决策”总览（自动路由、协同优先、advice-only、只读控制台、确认会话与事务策略、离线回归）
- **更新**: `docs/design/TECHNICAL-DESIGN.MD` 新增“AI 友好管理模式”专节（对话化管理、preview/确认约束、只读控制台边界）

### 🧭 Plan 工具选择增强

- **增强**: 工具关键词提取扩展至 schema 属性/描述，提高 Plan 命中率
- **增强**: 基于目标语句补全 `limit` / `timeRange` / `id` 等常见参数
- **增强**: Plan 阶段按 `context.roleIds` 调用 `listToolsForLLM` 过滤候选工具，减少越权工具被选中
- **增强**: `ack_alert` 选择策略新增“ID 感知”逻辑：有告警 ID 时优先 `ack_alert`，无 ID 时先走 `query_alerts`
- **增强**: 动态工具选择增加意图门禁，避免误选 `rate_knowledge` / `write_experience` / 高风险执行器（script/shell/kubectl）
- **增强**: 新增评分反馈显式规则：当用户表达评分意图且提供 `memoryId` 时，优先选择 `rate_knowledge`
- **调整**: `plan()` 升级为异步流程，`Agent Loop` 与管理端 `plan/preview` 同步适配
- **增强**: 新增执行类工具意图门禁（SSH/变更类名称规则），普通解释类问题默认抑制高风险工具误选
- **增强**: Plan 动态选工具接入 `riskLevel` 风险感知（`write/high-risk` 分数惩罚 + 门禁），降低误召回
- **测试**: 补充 `dual-system` 用例，覆盖 SSH 运维意图放行与变更类工具误选抑制
- **测试**: 补充 `dual-system` 用例，覆盖 `high-risk kind` 抑制与 `write risk` 变更意图放行

### 🧠 Orchestrator 任务分析增强

- **增强**: 规则分析新增任务类型识别（`query/action/analysis/collaboration`）
- **增强**: 规则分析新增意图提取，返回结构化意图摘要而非原文透传
- **增强**: 新增流水线依赖检测（先后顺序标记），并在多能力场景优先建议 `pipeline` 模式
- **调整**: LLM 分析结果中的 `type` 统一归一化，避免非标准类型污染执行链路
- **测试**: 新增 Orchestrator 单测覆盖任务类型归一化、流水线依赖检测与意图提取

### 🧰 Agents 专用工具落地

- **增强**: `ObservabilityExpert` 告警/指标场景接入真实工具调用（`query_alerts` / `query_metrics`）
- **增强**: `ObservabilityExpert` 新增“确认告警”意图，接入 `ack_alert`
- **增强**: `KnowledgeExpert` 新增“经验沉淀”意图，接入 `write_experience`
- **增强**: `DevOpsExpert` 部署/基础设施场景接入运行时信号采集（`query_alerts` / `query_metrics`）
- **测试**: 新增 `src/agents/__tests__/specialized-tools.test.ts`，覆盖上述工具调用链路

### 📡 真实监控数据源接入

- **新增**: 监控服务模块 `src/services/monitor.ts`，支持 BK_MONITOR 指标查询 / 告警查询 / 告警确认
- **增强**: `query_metrics` / `query_alerts` / `ack_alert` 在配置存在时调用真实监控 API
- **兼容**: 未配置 `BK_MONITOR_URL`/`BK_MONITOR_TOKEN` 时自动回退模拟数据，保证本地可用性
- **测试**: 新增 `src/services/__tests__/monitor.test.ts` 覆盖配置检测与 API 归一化

### 🛡️ 工具风险分级

- **新增**: 工具风险分级规则 `src/services/tools/risk.ts`（`read` / `write` / `high-risk`）
- **增强**: `listToolsForLLM` 返回 `riskLevel`，供 Planner/治理链路使用
- **增强**: 管理接口 `GET /api/admin/tools` 返回 `riskLevel`，支持控制台与对话式管理统一风控
- **测试**: 新增 `src/services/tools/__tests__/risk.test.ts`

### 🧪 测试稳定性

- **修复**: 集成测试中协作场景时延断言由 `> 1ms` 调整为 `>= 1ms`，避免时间分辨率导致的偶发失败

### 📊 Agent Token 统计

- **增强**: `BaseAgent` 新增统一 `finalizeTokenUsage`，在缺少 LLM usage 时按响应内容估算 token
- **增强**: `Observability/Knowledge/DevOps/GeneralAssistant` 执行结果改为实际回填 `tokensUsed`，不再固定 `0`

### 🧭 设计方向更新

- **规划**: 新增“多执行器统一治理（MCP/Skill/Script/Kubectl/Builtin）+ 对话式管理（ChatOps Admin）”待办事项
- **规划**: 确认管理写操作流程为 `preview -> 回复“确认” -> execute -> audit`
- **规划**: 控制台定位调整为只读视图，写操作统一走 AI 对话
- **规划**: `kubectl` 作为独立工具 kind 管理，便于独立风控与审计
- **规划**: 执行模式分层为 `read-only` / `advice-only`，前期所有变更类操作默认仅返回指令、不自动执行
- **规划**: AdminAction v1 最小集合定版为 8 个动作（tool/role/mcp/token）
- **规划**: 管理写操作“确认”会话有效期定版为 5 分钟
- **规划**: 多动作事务策略定版为 all-or-nothing（失败回滚，不开放 partial success）
- **规划**: 补充自动学习闭环（Learning Loop）待办：触发器、结构化抽取、质量门禁、反馈回路、生命周期与观测
- **规划**: 补充记忆体系重构待办：短期记忆动态窗口、工作记忆槽位化、长期记忆语义召回优先

### 🧪 离线测试能力

- **新增**: `npm run test:no-llm`，用于在未接入本地 LLM 时执行回归测试（忽略 `src/services/__tests__/llm.test.ts`）
- **新增**: `make test-no-llm`，一键触发离线回归入口

### 🔷 MCP 执行器收口

- **增强**: 支持通过 `tool_configs` 覆盖 `serverId` / `mcpToolName` / `defaultParams` / `headers`
- **文档**: MCP 执行器与工具系统设计文档补充配置覆盖说明

### 🧪 自动化测试脚本修正

- **修复**: `scripts/test/*` 适配当前鉴权模型（`Authorization: Bearer <token>`）
- **修复**: 静态页面测试健康检查路径改为 `/health`
- **修复**: Shell 脚本兼容性问题（`head -n-1` / `/scripts/null`）
- **修复**: `scripts/test/test-mcp.sh` 改为调用实际 MCP 路由 `/mcp/request`（JSON-RPC）
- **修复**: `scripts/test/test-mcp-executor.sh` 在未安装 `jq` 时降级为原始 JSON 输出
- **修复**: `scripts/test/test-mcp-executor.sh` 增加 `success:true` 校验，避免接口报错时误判通过
- **修复**: `scripts/test/test-role-permissions.sh` 单项失败不再提前中断，输出完整汇总

## [未发布] - 2026-02-09

### 🧭 Plan 工具选择调试面板

- **新增**: 管理端接口 `POST /api/admin/plan/preview`，支持预览复杂度、计划步骤、工具打分与理由
- **新增**: 管理后台 `Plan 调试` 面板，可输入 goal 进行工具选择可视化调试
- **增强**: `Plan` 选择步骤附带 `selectionScore` 与 `selectionReasons`，便于追踪“为何选中该工具”

### 🔐 API/MCP 令牌与用户绑定

- **新增**: 企微用户表 `users` 与 API/MCP 令牌表 `user_tokens`（支持过期与吊销）
- **新增**: 用户级工具配置 `tool_configs`（允许按用户绑定工具密钥与配置）
- **新增**: 管理端 API 支持用户令牌管理与工具配置管理
- **调整**: API/MCP 访问统一要求 `Authorization: Bearer <token>`（绑定企微用户）

### 💾 会话与对话持久化

- **新增**: conversations 会话消息持久化（API/MCP/企微统一写入）
- **新增**: session_contexts 在对话写入时同步更新

### 🧠 Skill 执行器接入

- **新增**: Skill 工具执行器支持 HTTP Runtime 调用（POST）
- **新增**: 支持按用户/角色工具配置解析 runtime endpoint/defaultParams/headers
- **新增**: 支持读取 `tool_configs.secret_value` 透传为鉴权头

### 📜 Script 执行器规范化

- **新增**: 脚本白名单机制（`TOOLS_SCRIPT_ALLOWLIST`）
- **新增**: 脚本执行超时控制（`TOOLS_SCRIPT_TIMEOUT_MS`）
- **新增**: Script 执行审计日志（含用户、耗时、超时、退出码）

### 🔷 MCP 服务器配置入库

- **新增**: MCP 服务器配置表 `mcp_servers`（支持启用/禁用）
- **新增**: 管理端 API 写入数据库并热加载到 MCP Client
- **增强**: 运行时 MCP 服务器改为与数据库全量同步（禁用/删除可立即生效）
- **新增**: 重载接口 `POST /api/mcp/servers/reload` 与管理端“重载到运行时”按钮

### 🔍 Nginx 和企微 Callback 配置检查

#### 检查报告
- **新增**: Nginx 和 Callback 接口检查报告 `docs/NGINX-CALLBACK-CHECK-REPORT.MD`
  - 详细的配置检查结果（Nginx、K8s Ingress、企微 Callback 接口）
  - 域名配置问题分析（单 .com vs 双 .com）
  - 企微 Callback 接口实现验证（GET/POST）
  - 完整的测试验证步骤和命令
  - 故障排查指南（常见问题和解决方案）
  - 配置修复建议和后续优化建议

#### 工具脚本
- **新增**: 域名配置修复脚本 `scripts/deploy/fix-domain.sh`
  - 自动检测当前域名配置
  - 交互式选择正确域名（单 .com / 双 .com / 自定义）
  - 批量更新所有配置文件（Nginx、K8s、配置脚本）
  - 自动备份原配置到时间戳目录
  - 提供后续操作指引（重载 Nginx、更新 K8s、测试验证）

- **新增**: 域名健康检查脚本 `scripts/test/test-domain-health.sh`
  - DNS 解析检查（支持 nslookup 和 dig）
  - HTTP 基础访问检查（健康检查端点、根路径）
  - 企微 Callback 接口检查（GET/POST，带参数和不带参数）
  - 响应时间测试（性能评估）
  - Nginx 配置验证（服务状态、配置语法、域名配置）
  - 后端服务状态检查（端口监听、本地服务）
  - 详细的检查报告和通过率统计
  - 失败时提供具体的修复建议

#### 检查结果
- ✅ Nginx 本地配置正确 (`nginx-local.conf`)
  - 监听 80 端口，server_name 配置正确
  - `/wechat/callback` 路由已配置
  - 代理到本地 3000 端口，设置了正确的 proxy headers
- ✅ Nginx 生产配置正确 (`scripts/deploy/setup-nginx.sh`)
  - 监听 80 端口，server_name 配置正确
  - `/wechat/` 路径已配置（包含 callback）
  - 代理到 K8s NodePort (30800)，设置了合理的超时时间
- ✅ K8s Ingress 配置正确 (`nodejs/k8s/ingress.yaml`)
  - host 配置正确，路径类型为 Prefix（匹配所有路径）
  - 后端服务配置正确，超时时间和请求体大小限制合理
- ✅ 企微 Callback GET 接口实现完整
  - 参数验证、签名验证、支持加密和非加密模式
- ✅ 企微 Callback POST 接口实现完整
  - 支持加密和明文消息、签名验证、消息解析、Agent Team 集成
- ⚠️ 域名配置需要确认（配置文件使用 `sre-copilot.example.com`，但用户提到 `sre-copilot.example.com`）

#### 使用方法
```bash
# 查看检查报告
cat docs/NGINX-CALLBACK-CHECK-REPORT.MD

# 修复域名配置
./scripts/deploy/fix-domain.sh

# 运行健康检查
./scripts/test/test-domain-health.sh

# 指定域名检查
./scripts/test/test-domain-health.sh sre-copilot.example.com
```

### 📚 文档与静态页面

#### 静态资源部署
- **新增**: 文档中心首页 `nodejs/static/index.html` ⭐
  - 精美的导航页面，提供所有文档的快速入口
  - 现代化 UI 设计：渐变背景、卡片式布局、流畅动画
  - 系统统计数据展示（4个专家、6层架构、3层记忆）
  - 响应式设计，支持桌面和移动端访问
  - 访问路径：`/` 或 `/static/index.html`

- **迁移**: 系统架构图 `nodejs/static/architecture-diagram.html`
  - 从 `docs/` 目录迁移到 `nodejs/static/` 目录
  - 修复 Mermaid.js 图表渲染问题
  - 优化图表配置，提升渲染性能
  - 访问路径：`/architecture` 或 `/static/architecture-diagram.html`

- **迁移**: 三层记忆系统 `nodejs/static/three-layer-memory.html`
  - 从 `docs/` 目录迁移到 `nodejs/static/` 目录
  - 保持完整的交互式演示和详细说明
  - 访问路径：`/memory` 或 `/static/three-layer-memory.html`

- **新增**: 静态资源文档 `nodejs/static/README.MD`
  - 详细说明所有静态页面的用途和访问方式
  - 包含开发环境和生产环境的访问指南
  - 提供维护指南和样式规范
  - 技术栈和安全说明

- **更新**: 主 `README.MD`
  - 添加静态文档页面访问说明
  - 完善项目结构（包含 scripts 和 static 目录）
  - 整合脚本使用说明到快速开始部分

#### 路由配置
- **更新**: `nodejs/src/main.ts` - 静态页面与 API 路由
  - `GET /` - 首页（文档中心）
  - `GET /api` - API 信息（JSON，端点列表）
  - `GET /architecture` - 系统架构图
  - `GET /memory` - 三层记忆系统
  - `GET /admin` - 管理控制台（已有）
  - 所有页面支持通过 `/static/` 前缀直接访问

#### 测试工具
- **新增**: 静态页面测试脚本 `scripts/test/test-static-pages.sh`
  - 自动测试所有静态页面路由
  - 验证路由访问和静态文件访问
  - 彩色输出，清晰的测试结果汇总
  - 使用方法：`./scripts/test/test-static-pages.sh`

### 🎨 设计改进

#### 统一视觉风格
- 所有页面采用统一的紫色系主题（#667eea → #764ba2）
- 现代化 UI 组件：卡片、标签页、动画、渐变
- 响应式设计，支持多端访问
- 丰富的交互效果：悬停、过渡、加载动画

#### 用户体验优化
- 清晰的导航结构和面包屑
- 专业的图表可视化（Mermaid.js）
- 合理的字体大小、行高、间距
- 零依赖，纯 HTML + CSS + JavaScript

---

## [未发布] - 2026-02-07

### ✅ 完成功能

#### LLM 服务接入验证
- **蓝鲸 AI 平台集成**：
  - ✅ OpenAI 兼容接口调用（`/chat/completions`）
  - ✅ 蓝鲸 API 网关认证（`X-Bkapi-Authorization` 头）
  - ✅ 支持自定义模型（默认 `hunyuan`）
  - ✅ 系统提示词配置支持
  - ✅ 完善的错误处理和降级策略
  
- **服务能力验证**：
  - ✅ 配置检查接口：`GET /wechat/config-check`
  - ✅ 对话接口：`POST /api/chat`
  - ✅ 验证脚本：`./scripts/test/verify-llm.sh`
  - ✅ 单元测试覆盖：`llm.test.ts`

- **环境变量配置**：
  - `BK_AI_GATEWAY_URL` - 蓝鲸 AI 网关地址
  - `BK_APP_CODE` - 应用认证码
  - `BK_APP_SECRET` - 应用密钥
  - `BK_LLM_MODEL` - 模型 ID（可选）
  - `LLM_SYSTEM_PROMPT` - 系统提示词（可选）

### 📚 新增文档

#### 文档索引与 TODO 清单
- **新增**: `DOCS-INDEX.MD` - 项目文档索引 ⭐
  - 项目概览与技术架构
  - 核心功能模块梳理（已完成 + 设计中）
  - 开发进度总览（4 个已完成里程碑）
  - 详细 TODO 清单（按 P0/P1/P2 优先级分类）
  - 部署与运维指南
  - 质量保证体系
  - 文档导航与团队协作

#### 双系统理论架构设计
- **新增**: `docs/design/DUAL-SYSTEM-DESIGN.MD` - 双系统理论完整设计文档
  - 基于认知科学的架构升级设计
  - 系统1（快思考）+ 系统2（慢思考）双路径
  - 5 个核心模块设计（上下文准备器/意图识别器/路由决策器/模板格式化器/性能监控器）
  - 详细 TODO 清单（Phase 6.1-6.3，15+ 子任务）
  - 预期效果：延迟降低 52%，成本节约 30%
  - 完整的验收标准和 A/B 测试计划

### 🔧 代码改进

#### Agent 模块基础准备
- **新增**: `nodejs/src/agent/complexity-assessor.ts` - 复杂度评估器（基础版本）
- **新增**: `nodejs/src/agent/__tests__/dual-system.test.ts` - 双系统测试框架

#### 企微 Bot 生产验证完成
- **已完成**: 13个企微系统命令的生产验证 ✅
  - 包括：帮助、状态、配置、数据库、角色、工具、搜索、个人信息等
  - 支持中英文混合识别和角色权限管理
  - 已在实际企业微信群组中测试验证
  - 完全本地处理，无需LLM调用，响应快速
- **修改**: `nodejs/src/agent/types.ts` - 扩展类型定义（PlanStep/ActionResult metadata）
- **修改**: `nodejs/src/agent/plan.ts` - 为双系统集成预留接口
- **修改**: `nodejs/src/agent/act.ts` - 为双系统集成预留接口

### 📝 文档更新

#### README.MD 更新
- 更新路线图（Phase 1-5）
- 新增"文档索引"入口链接
- 更新文档导航（增加进度文档、验收文档分类）
- 更新版本号（2.0.0 → 2.0.1）

#### 开发计划整理
- 明确 Phase 3 已完成项（角色权限、知识库、企微命令）
- 明确 Phase 4 进行中项（双系统、Agent Loop、工具增强）
- 明确 Phase 5 计划项（任务调度、监控、工具生态）

---

### ✨ 新增功能

#### 企微 Bot 命令系统增强
- **8 个新增系统命令**：
  - `status` / `状态` - 查看系统运行状态（运行时长、数据库、版本、平台信息）
  - `config` / `配置` - 查看系统配置状态（隐藏敏感信息）
  - `db` / `数据库` - 数据库连接状态和可用功能清单
  - `roles` / `角色列表` - 查看所有系统角色
  - `whoami` / `我是谁` - 查看个人信息、角色和工具数量
  - `version` / `版本` - 系统版本详细信息
  - `time` / `时间` - 当前服务器时间
  - `ping` - 连接测试

- **改进的 help 命令**：
  - 完整的命令列表
  - 中英文双语支持
  - 更清晰的分类

#### 功能特性
- ✅ 所有命令支持中英文别名
- ✅ 命令可以嵌入在句子中（如："请帮我查看一下状态"）
- ✅ 敏感配置信息自动隐藏（仅显示是否已配置）
- ✅ 数据库降级策略（DB 不可用时仍可使用基础命令）
- ✅ 格式化输出（运行时长、时间、状态图标）

### 📚 新增文档
- `docs/tools/BOT-COMMANDS.MD` - 企微 Bot 命令完整参考手册
  - 10 个命令的详细说明
  - 使用示例和返回格式
  - 权限说明
  - 使用提示

### 🔧 改进
- 优化命令解析逻辑（支持模糊匹配）
- 增强错误处理和日志记录
- 改进消息格式（使用 Markdown 和 Emoji）

---

## [1.0.0] - 2026-02-06

### ✨ 首次发布

#### 核心功能
- **Agent Loop (OPAR 循环)**
  - Observe → Plan → Act → Reflect
  - 自主决策能力
  - 工具调用支持
  - 多步推理

- **角色权限系统** ⭐
  - 用户 → 角色 → 工具三层隔离
  - 9 个 RESTful 管理 API
  - 运行时权限检查
  - 数据库表结构完整
  - 管理端 UI

- **企业微信集成**
  - 双向通信（Webhook 回调 + 主动推送）
  - 消息加密/解密
  - 群聊和私聊支持
  - @机器人触发
  - 基础命令系统（help/time/tools/ping）

- **MCP Server**
  - Model Context Protocol 标准接口
  - Cursor IDE 集成
  - 工具暴露和调用

- **工具系统**
  - 5 种工具类型：builtin/mcp/skill/script/shell
  - 工具注册中心
  - 按角色过滤
  - 权限检查

#### 部署与运维
- Docker 容器化（128MB 轻量镜像）
- Kubernetes 生产配置
- SSH 远程部署脚本
- Makefile 简化命令
- 健康检查端点

#### 数据库
- PostgreSQL + pgvector
- 表结构：roles, user_roles, role_tools, memories, conversations, tool_executions
- 自动迁移和初始化
- 降级策略（DB 不可用时服务仍可运行）

#### 文档
- 技术设计文档（`docs/design/TECHNICAL-DESIGN.MD`）
- 企微Bot使用指南（`docs/wecom/WECOM-BOT-GUIDE.MD`）
- 角色权限验收报告（`DOCS-INDEX.MD`）
- 开发路线图（`docs/roadmap/ROADMAP.MD`）
- 部署规则（`.codebuddy/rules/`）

#### 测试
- 单元测试框架（Jest）
- Agent Loop 测试
- LLM 服务测试
- 企微命令测试

---

## 版本说明

### 语义化版本
- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 发布周期
- **主版本**：重大功能或架构变更
- **次版本**：新功能发布（1-2 个月）
- **修订版**：Bug 修复和小改进（随时）

---

## 计划功能 (Roadmap)

### Phase 3: 系统集成（进行中）
- [ ] LLM 完整接入和验证
- [ ] 记忆系统实现（三层记忆 + 向量检索）
- [ ] 任务调度器（定时任务、主动巡检）
- [ ] 监控系统集成（BkMonitor 告警处理）
- [ ] 工具生态扩展（10+ 内置工具）

### Phase 4: 智能化增强
- [ ] 多轮对话支持
- [ ] 上下文理解优化
- [ ] 自学习能力（从反馈中学习）
- [ ] 工具自动选择（Plan 层优化）
- [ ] 经验沉淀和检索

### Phase 5: 企业级特性
- [ ] 多租户支持
- [ ] 审计日志增强
- [ ] 性能监控和告警
- [ ] 备份和恢复
- [ ] 高可用部署

---

## 贡献者

- **开发团队**：SRE Copilot Team
- **维护者**：shamcleren
- **技术栈**：Node.js 18+ + TypeScript + Fastify + PostgreSQL

---

## 许可证

MIT License

---

**最后更新**：2026-02-25
# 2026-03-14

## 🗂️ 调优阶段待办重排（2026-03-16）

- 将项目后续主线从“性能优先”调整为“效果优先、性能后置”
- `TODO.MD` 已新增“真实效果调优与线上回放”阶段，明确先做真实 case 回放、正向命中链路验收、现象真实性验证和弱证据回答收敛
- 性能优化独立后移到新阶段，缓存也明确调整为效果稳定后的优化项，而不是当前主线
- 已明确 `unify_query + 实体关联` 是下一轮效果调优核心：当前缺口已回写到 `TODO.MD`
- 已新增 `docs/verification/EFFECT-TUNING-CASE-MATRIX.MD`，将后续效果调优收敛到固定 case 矩阵，要求每轮改造都走“本地回归 + 远端回放 + 线上目标场景”闭环
## 🔬 LLM 交叉测试基线与页面修复（2026-03-14）

- 修复独立可观测页 `LLM 交叉测试 Benchmark` 的请求头问题，`DE.apiFetch()` 现在会为 JSON 字符串请求体自动补 `Content-Type: application/json`
- Admin 与 Observability 的 benchmark 模型输入从自由文本改为后端驱动的多选列表，不再要求手填逗号分隔模型名
- 新增 `/api/admin/llm-cross-test/options`，统一返回 `bk_ai / minimax` 的 benchmark 模型选项和默认勾选项
- `scripts/test/verify-online-regression.sh` 已补 `llm-cross-test/options` 与 `llm-cross-test` 冒烟校验，并修正端口转发等待时序
- 新增 `scripts/test/run-llm-cross-benchmark.js` 与 `make benchmark-llm-cross`，可基于 `eval/corpus.json` 代表 case 落盘默认交叉 benchmark 报告
- 已生成默认基线：`docs/verification/LLM-CROSS-BENCHMARK-20260314-1105.MD` / `.JSON`

## 🧭 “我的服务情况”首轮补材料输出修复（2026-03-14）

- **修复**: `loop.ts` 现在会接住 `request_evidence / playbook_response` 的结构化输出，不再只认 `answer`，避免首轮已完成却落入“抱歉，暂时无法生成回复。”
- **补强**: 新增 `runAgentLoop` 回归，覆盖“服务定位未命中 -> 首轮直接返回结构化补材料结果”
- **验证**: `cd nodejs && npm test -- --runInBand src/agent/__tests__/loop.test.ts src/services/__tests__/troubleshooting-conclusion-validator.test.ts src/services/__tests__/service-locator.test.ts`
- **验证**: 本地定向回归 `68/68` 通过，报告 `docs/verification/LOCAL-VERIFY-20260314-1449.MD`
- **上线**: 远端部署版本 `20260314-144932` 已完成，目标场景线上回归报告 `docs/verification/ONLINE-VERIFY-20260314-1455.MD`

## 🧩 子线程实体线索进入规划阶段（2026-03-14）

- `plan.ts` 已开始读取当前聚焦子线程的实体摘要与实体 hints，LLM 规划 prompt 会带上当前线程关联实体
- 规则规划已支持使用实体线索为工具加分，并可用 `businessId / tableId / traceId / spaceUid / url` 自动补参数
- `thread-execution.ts` 已支持保留显式 `threadId`，避免后续 attach metadata 时冲掉子线程归属
- `act.ts` 的 answer prompt 已开始按 `threadId` 聚焦当前子线程目标，避免复合请求在回答阶段重新串扰
- `turn-modeling.ts` 已开始保留 `rawInput`，`entity-resolution.ts` 已支持按线程加载“实体占位 + 原文片段”，不再只传压缩后的实体摘要
- `threadExecution` 已开始累计子线程级 `evidence / guidance / hypothesis` 摘要，主线程汇总 prompt 会显式注入 `[子线程证据摘要]`
