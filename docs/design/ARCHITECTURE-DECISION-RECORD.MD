# 架构决策记录 (ADR)

**创建时间**：2026-03-05  
**状态**：待讨论  
**上下文**：阶段 A/B 修复与可扩展性重构完成后，针对设计与实现之间的结构性差距，需要做出方向性决策。

---

## ADR-1: ChatOps 意图识别架构

### 背景

当前 `chatops-parser.ts` 有 ~800 行代码，使用「正则为主、LLM 兜底」的混合方案：

```
输入 → JSON 解析 → 文本归一化 → detectCapability(正则) → 分支：
  write → tryUnifiedManagementAction(正则矩阵) → parseNaturalLanguage(正则) → LLM 兜底
  read  → inferIntentWithMemory(LLM) → resolveReadQuery → 正则兜底
```

**核心问题**：正则为主路径意味着每新增一种意图/实体都需要 hardcode 新模式，无法泛化。用户已经指出"纯靠正则匹配是无法识别出完整语义意图的"。

### 方案对比

| 维度 | A: 正则主路径 (现状) | B: LLM 主路径 | C: 轻量 LLM 分类 + 结构化提取 |
|------|---------------------|--------------|-------------------------------|
| **意图覆盖率** | 低（仅覆盖已编码模式） | 高（自然语言理解） | 高 |
| **新增实体成本** | 高（改代码+改正则） | 零（prompt 调整） | 低（改 prompt schema） |
| **延迟** | ~0ms | ~200-500ms | ~100-200ms（轻量模型） |
| **可测试性** | 高（确定性） | 低（LLM 不确定） | 中（可 pin 模型版本） |
| **降级能力** | 不需要 | 需要正则兜底 | 需要正则兜底 |
| **Token 成本** | 零 | 中 | 低 |

### 推荐方案：C（轻量 LLM 分类 + 结构化提取）

```
输入 → 一阶 LLM 分类（~50 tokens）→ 分支：
  question → 直接返回（不走 ChatOps）
  read     → LLM 结构化提取（entity + params）→ resolveReadQuery
  write    → LLM 结构化提取（action + entity + params）→ 校验 → 执行
  unknown  → 原样传给 AI 对话

正则：仅作为 LLM 不可用时的降级路径
```

**理由**：
1. 代码基础已有：`inferIntentWithMemory` + `resolveReadQuery` 已在读路径上验证可行
2. 只需将 LLM 从"兜底"提升为"主路径"，正则降级为"fallback"
3. 一阶分类用极少 token 就能区分 question/read/write/unknown

### 待决事项

- [ ] 是否接受 LLM 调用带来的延迟（~200ms）
- [ ] 是否用缓存（相同输入缓存意图分类结果）降低成本
- [ ] 回归矩阵测试如何兼容 LLM 不确定性（golden test + tolerance）

---

## ADR-2: 双系统理论实现程度

### 背景

设计文档定义了完整的 System 1/2 架构（LLM 意图识别 → 路由 → 分支执行），但当前仅实现了 `complexity-assessor.ts`（正则评估）+ plan.ts 中内联的 trivial 快速通道。落地率 25%。

### 方案对比

| 维度 | A: 保持现状 | B: 补齐设计 | C: 简化设计到当前能力 |
|------|-----------|-----------|---------------------|
| **工作量** | 零 | 大（新增 3+ 模块） | 小（更新文档） |
| **价值** | 低（大量设计文档成摆设） | 高（完整双系统） | 中（设计与实现对齐） |
| **风险** | 无 | 中（增加复杂度） | 低 |
| **实际效果** | 简单任务已有快速通道 | 更精准的路由 | 诚实记录当前状态 |

### 推荐方案：C + 渐进式 B

1. **立即**：更新设计文档，标注当前实际实现的子集，删除未实现的承诺性描述
2. **短期**：将 ADR-1 中的轻量 LLM 分类接入 `plan.ts`，替代纯正则 `assessTaskComplexity`
3. **中期**：上下文准备器 (`context-preparer.ts`) 接入 observe 阶段（已有 Provider 模式基础）
4. **暂缓**：模板格式化器、PerformanceMonitor、/api/agent/metrics（低优先级）

**理由**：双系统的核心价值在于"简单任务跳过深度推理"，当前已实现这一核心。补齐的重点应放在路由精度（用 LLM 替代正则），而非补齐所有设计细节。

---

## ADR-3: Orchestrator 与 Agent Team 架构

### 背景

已有 `orchestrator/index.ts` 的 `AgentOrchestrator`，支持 4 种执行模式（single / competition / collaboration / pipeline）。但实际运行时大部分请求走 single 模式。

### 问题

1. Orchestrator 与 OPAR Loop 的边界模糊——谁来决定执行模式？
2. 多 Agent 协作（collaboration/pipeline）缺少真实场景验证
3. 当前 Agent Team 成员（分析、运维、沟通、综合）功能重叠大

### 推荐方向

**保持 single 模式为主，仅在以下场景启用多 Agent**：
- competition：用户提问模糊时，多个 Agent 独立生成答案，取最优
- collaboration：明确的多步骤流程（如"先查监控，再分析日志，最后出报告"）

**不建议**：
- 拆分更多 Agent 类型（增加复杂度但收益不明显）
- Pipeline 模式（当前无明确适用场景）

---

## ADR-4: K8s 管理工具策略

### 背景

`k8s-management.ts` 已实现 kubectl 透传执行，使用 verb 白名单限制（仅 read 操作）。

### 问题

1. kubectl 直接执行是否足够安全（即使限制了 verb）
2. 是否需要支持写操作（apply/delete）——ChatOps 场景下
3. 多集群管理的凭据安全性

### 方案对比

| 维度 | A: 只读 (现状) | B: 读写 + 审批 | C: 接入 K8s API |
|------|---------------|---------------|----------------|
| **安全性** | 高 | 中（依赖审批流） | 高（RBAC 可控） |
| **能力** | 受限 | 完整 | 完整 |
| **实现复杂度** | 低 | 中 | 高 |
| **审计** | 日志级 | 需要审批链 | API 级审计 |

### 推荐方案：A（保持只读），预留 B 的扩展接口

**理由**：
1. 读操作已覆盖 80% 的日常运维诊断场景
2. 写操作（apply/delete）风险高，需要完整的审批链和回滚机制
3. `k8s-management.ts` 当前设计已是可扩展的（verb 白名单可配置化）

**待做**：
- [ ] verb 白名单从硬编码改为配置文件 / 环境变量
- [ ] 多集群凭据改为从 Secret Manager 获取（非环境变量）

---

## ADR-5: 已完成的扩展性改造（参考）

以下改造已在阶段 B 中完成，为上述 ADR 的实现奠定了基础：

| 模块 | 改造前 | 改造后 |
|------|--------|--------|
| observe.ts | 硬编码 3 个数据源 | Provider 模式，registerObservationProvider() |
| main.ts init | 60 行 .then() 链 | Lifecycle Module 注册，priority 排序 |
| executors/index.ts | 5-case switch | ToolExecutor 注册表，registerToolExecutor() |
| admin.html switchPanel | 10-case switch + titles 对象 | Panel Registry，registerPanel() |

这些改造使得后续实现 ADR-1~4 时，新增模块只需注册而非修改现有代码。

---

## 优先级排序

| 优先级 | ADR | 行动 |
|--------|-----|------|
| P0 | ADR-1 ChatOps | LLM 主路径改造（核心用户痛点） |
| P1 | ADR-2 双系统 | 更新设计文档 + LLM 分类接入 plan |
| P2 | ADR-4 K8s | verb 白名单配置化 |
| P3 | ADR-3 Orchestrator | 保持现状，文档对齐 |

---

**下一步**：与项目负责人讨论以上决策，确认方向后进入实施。
