# 文档索引（整理版）

> 新路线核心设计为 `docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD`。其余文档按用途归类，便于检索与维护。
> 命名规范：所有 Markdown 文档文件名使用全大写（含扩展名 `.MD`）。
> 当前口径：已决定先执行 **Phase 0 完整退役旧 V2 及其工具链**，再进入唯一的 `agent/` Pi Core 路线。旧代码在 Phase 0 实际执行前仍存在，但禁止继续扩展。
> 执行顺序：先评审并执行 legacy retirement plan；`clean:start:verify` 通过后，才允许执行 Phase 1 vertical slice plan。

## 核心设计
- `docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD` - 新一代 Pi SRE Copilot 主设计（Phase 0 干净基线、ActionPlan 状态机、确定性策略、确认、幂等、复验与审计边界）
- `docs/design/TECHNICAL-DESIGN.MD` - 旧 runtime 技术设计（Phase 0 删除输入，删除后从 Git 历史查阅）
- `docs/design/TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD` - 排障自动化现状评估与冻结结论
- `docs/design/CURRENT-IMPLEMENTATION-MAP.MD` - 当前代码实现地图（主链路、入口差异、能力边界）
- `docs/design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD` - 排障自动化目标设计（意图 / playbook / 交互 / 工具 / 结论）
- `docs/design/SRE-COPILOT-V2-HARNESS-FIRST-DESIGN.MD` - V2 重建方案（Harness-first 目录、契约、迁移顺序与切换条件）
- `docs/design/DUAL-SYSTEM-DESIGN.MD` - 双系统理论设计（作为设计子项）
- `docs/design/CHATOPS-INTENT-DESIGN.MD` - ChatOps 意图系统化方案与下线选项（问题诊断、问句/指令一阶分类、回归矩阵、CHATOPS_ENABLED）
- `docs/design/ARCHITECTURE-DECISION-RECORD.MD` - 架构决策记录（ChatOps/双系统/Orchestrator/K8s）
- `docs/tools/TOOLS-DESIGN.MD` - 工具系统设计

## Superpowers / 规格
- `docs/superpowers/specs/2026-03-31-KNOWLEDGE-ADAPTER-DESIGN.MD` - `knowledge` adapter 设计规格（最小增量接通 `search_knowledge / mcp_search_knowledge`、统一 blocker/evidence 语义与 regression 验收）
- `docs/superpowers/specs/2026-03-30-WORKFLOW-ORCHESTRATOR-DESIGN.MD` - workflow orchestrator 设计规格（开发接手/续接流程状态机、统一命令面、迁移与验收策略）

## Superpowers / 计划
- `docs/superpowers/plans/2026-08-14-SRE-COPILOT-LEGACY-RETIREMENT-PLAN.MD` - Phase 0 完整退役旧 runtime、eval、运行/部署工具链和活跃文档口径，并建立 clean-start guard
- `docs/superpowers/plans/2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD` - Pi Core 第一阶段实施计划（仅覆盖 `demo-service` 5xx 告警 fake vertical slice）
- `docs/superpowers/plans/2026-03-30-WORKFLOW-ORCHESTRATOR-IMPLEMENTATION-PLAN.MD` - workflow orchestrator 实现计划（共享状态源、状态机、CLI runner、命令接线与文档迁移）

## 使用说明
- `docs/CHATOPS-FEEDBACK-GUIDE.MD` - 通过 ChatOps/专家对话提交 Bug 反馈

## CLI / MCP / 工具 / 命令
- `docs/tools/CLI-REFERENCE.MD` - **CLI 历史归档说明**（`srectl` 已不再随当前仓库分发，文档仅供历史参考）
- `docs/tools/MCP-EXECUTOR.MD` - MCP 执行器说明
- `docs/tools/MCP-CURSOR-VS-SRE-COPILOT.MD` - Cursor 本地 MCP 与 `sre-copilot` 调用监控 MCP 的差异对比
- `docs/tools/MCP-SKILLS-TOOLKIT.MD` - MCP 与 Skills 工具选型及迭代映射清单
- `docs/tools/ECC-SKILLS-OVERVIEW.MD` - Everything-Claude-Code Skills 中文总览与优先使用建议
- `docs/tools/MY-TOOLS-COMMAND.MD` - 工具命令说明
- `docs/tools/BOT-COMMANDS.MD` - Bot 命令说明
- `docs/tools/TOOLS-WECOM-ENTRY-ANALYSIS.MD` - 企微作为工具入口分析
- `docs/tools/SSH-REMOTE-MANAGEMENT-TOOL.MD` - SSH 远程管理工具接入说明
- `docs/tools/CODEX-REMOTE-OPS.MD` - Codex 远程运维命令说明
- `docs/tools/TOOL-COVERAGE-INVENTORY.MD` - 排障工具覆盖与 playbook 绑定清单
- `docs/tools/SUBAGENT-DRIVEN-DEVELOPMENT-3ROLE.MD` - 三角色（文档/开发/测试）子代理驱动开发方案

## 企微接入
- `docs/wecom/WECOM-BOT-GUIDE.MD` - 企微 Bot 使用与配置

## 验证 / 测试
- 目录职责：`eval/` 保存共享基线与共享/`V1` 机读结果，`v2/eval/` 保存 `V2` 专属 specs/runners/reports，`docs/verification/` 保存人类可读标准、状态与滚动验收报告。
- `docs/verification/VERIFICATION.MD` - 验收标准（当前以排障自动化评估语料为主基线）
- `docs/verification/ITERATION-PLAN.MD` - 分阶段计划（围绕评估语料推进实现）
- `docs/verification/HANDOFF-PROTOCOL.MD` - 开发接力协议（`workflow:*` 为默认入口，handoff/readiness 为派生视图）
- `docs/verification/HANDOFF-LATEST.MD` - 最新派生 handoff 快照（由 `npm run workflow:handoff` 刷新）
- `docs/verification/V2-READINESS-STATUS.MD` - 运行时状态页（readiness / 风险 / replaceability 详细结论）
- `docs/verification/MULTI-ENTRY-TEST-RUNBOOK.MD` - 多入口测试运行手册（Admin 前置配置、API / Web Chat / WeChat 联调顺序）
- `docs/verification/LOCAL-VERIFY-*.MD` - 本地定向验收报告（滚动保留最近 5 份）
- `docs/verification/ONLINE-VERIFY-*.MD` - 远端部署与线上回归验收报告
- `docs/verification/ADMIN-ACCEPTANCE-*.MD` - Admin 线上验收报告（业务配置 / K8s / 治理后台回归）
- `docs/verification/ADMIN-BIZ-CONTEXT-VERIFY-*.MD` - Admin 用户业务权限与默认业务解析线上验收记录
- `docs/verification/UNIFYQUERY-BIZ-FLOW-VERIFY-*.MD` - UnifyQuery 去环境化与按业务映射验收记录
- `docs/verification/UNIFYQUERY-DIRECT-TRACE-LOG-VERIFY-*.MD` - UnifyQuery Trace/Log 取消串联、改为直接参数查询的验收记录
- `docs/verification/UNIFYQUERY-MCP-REMOVAL-*.MD` - UnifyQuery 历史 MCP 下线验收记录
- `docs/verification/UNIFYQUERY-SYSTEM-CONFIG-VERIFY-*.MD` - UnifyQuery 系统级配置上线与线上直连验收记录
- `docs/verification/PLAYBOOK-COVERAGE-VERIFY-*.MD` - Playbook Coverage 本地验收报告（滚动保留最近 5 份）
- `docs/verification/EFFECT-TUNING-CASE-MATRIX.MD` - 效果调优与线上回放 case 矩阵（服务定位 / telemetry-first / 实体关联 / 协作推进）
- `docs/verification/MAINCHAIN-ACCEPTANCE-MATRIX.MD` - 主链验收矩阵（service_locator / telemetry-first / entity-relation / request_evidence 四分支验收）
- `docs/verification/V2-ACCEPTANCE-MATRIX.MD` - V2 真实场景验收矩阵（主入口 / 工具执行 / 协作补材料 / 权限阻塞 / 回滚路径）
- `docs/verification/V2-READINESS-CHECKLIST.MD` - V2 替换 V1 readiness checklist（可扩大灰度 / 可切主入口 / 可宣布替换完成的判据）
- `docs/verification/ARCHIVE/README.MD` - 历史验收与交接归档索引（M1/I3/全量回归/交接等）

## 评审报告
- `docs/review/PROJECT-REVIEW.MD` - 历史初评（2026-02-11，不作为当前项目基线）

## 规划与路线图
- `docs/roadmap/ROADMAP.MD` - 路线图（战略主线与迭代映射）

## 安全与密钥
- `docs/security/SECRET-MANAGEMENT.MD` - 密钥管理

---

# 根目录文档索引

## 项目概览
- `README.MD` - 项目总览与快速开始
- `AGENTS.MD` - 协同开发规范（AI/自动化）

## 本地开发
- `LOCAL-DEV-GUIDE.MD` - 本地开发指南

## 部署与运维
- `DEPLOYMENT-GUIDE.MD` - 部署指南（含优化总结与快速参考）

## 变更
- `CHANGELOG.MD` - 变更记录
