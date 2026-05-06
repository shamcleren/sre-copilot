# 项目路线图（Roadmap）

> 本文档只回答“项目当前朝哪里走”。
> 细化设计、验收和进展分别见 `docs/design/` 与 `docs/verification/`。

---

## 当前主线

当前项目主线已经切换为：

- 以真实排障语料为验收基线
- 以 `Chat + CLI -> /api/chat` 为主改造入口
- 以“排障自动化链路补齐”为第一优先级

不再使用以下旧口径：

- “项目整体已经完成，只剩按需扩展”
- “ChatOps 管理入口仍是当前产品主线”
- “多入口已经稳定一致”

## 战略目标

把系统从“排障助手”推进到“可执行排障 playbook 的系统”。

这件事拆成五条长期主线：

1. 意图主线：从粗粒度排障识别升级到场景级识别
2. 交互主线：从直接回答升级到先取证、再结论
3. playbook 主线：从知识片段升级到结构化步骤
4. 工具主线：从通用工具可选升级到场景化工具契约
5. 结论主线：从自由回复升级到证据化输出结构

## 阶段路线

### 近期

- 固定当前评估结论和主入口口径
- 清理主文档中的失真描述
- 建立统一验收标准和分阶段计划
- 选择首批高价值 case 作为实现样板

### 中期

- 完成排障场景化意图建模
- 落地缺材料追问动作
- 建立 playbook schema 和阶段推进机制
- 梳理排障所需工具覆盖和能力边界

### 远期

- 固定结论输出结构
- 对齐企微 / Orchestrator / 其他入口
- 形成长期可回归的排障自动化体系

## 当前判断

当前项目的关键问题不是“功能不够多”，而是：

- 主入口不统一
- 系统契约不完整
- 文档口径和实现状态长期漂移

所以后续优先级应始终遵守：

1. 先统一口径
2. 再补设计契约
3. 再做实现
4. 最后扩多入口和体验层

## 关联文档

- 技术主文档：`../design/TECHNICAL-DESIGN.MD`
- 评估结论：`../design/TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD`
- 当前实现：`../design/CURRENT-IMPLEMENTATION-MAP.MD`
- 目标设计：`../design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD`
- 验收标准：`../verification/VERIFICATION.MD`
- 分阶段计划：`../verification/ITERATION-PLAN.MD`
- 开发接力主入口：`../verification/HANDOFF-LATEST.MD`
- 运行时状态页：`../verification/V2-READINESS-STATUS.MD`
- 当前任务清单：`../../TODO.MD`
