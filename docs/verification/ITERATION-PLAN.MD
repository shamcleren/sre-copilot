# 分阶段计划（排障自动化）

> 本文档定义当前有效的分阶段工作计划。
> 所有工作项都应能映射回评估语料的维度失分。

## 1. 当前总目标

以 `eval/corpus.json` 为验收基线，把当前系统从“排障助手”推进到“可执行排障 playbook 的系统”。

## 2. 阶段划分

### 阶段 A：评估收口与主入口统一

目标：

- 固定设计结论
- 清理失真文档
- 明确主验收路径
- 统一 `/api/chat` 为当前排障主入口

关键交付：

- 当前评估结论文档
- 新的验收标准
- 新的项目路线图和进度口径
- 主入口差异清单

验收关注：

- 文档口径一致
- CLI / Chat 的评估路径明确

### 阶段 B：意图与场景建模

目标：

- 让系统不再只会输出 `troubleshoot`
- 能识别排障子场景

关键交付：

- `intent` 结构升级
- 场景枚举与命中依据
- 评估语料和代码中的场景映射

验收关注：

- `intent` 维度稳定通过
- 典型 case 不再误路由

### 阶段 C：引导交互与证据门禁

目标：

- 缺材料时稳定进入追问
- 不再无证据猜根因

关键交付：

- `request_evidence` 动作
- 材料模板与追问模板
- 证据完整度判定

验收关注：

- `interaction` 维度显著提升
- 26948 这类 case 能先追材料

### 阶段 D：playbook 与工具路由

目标：

- 把排障笔记抽成结构化步骤
- 让工具调用和排障阶段绑定
- 把新增场景的主要工作收敛为“补 playbook 数据”，而不是继续扩引擎硬编码

关键交付：

- playbook schema
- 场景到 playbook 的映射
- 工具能力清单和前置条件
- playbook registry 的外置化方案（文件或存储层）

验收关注：

- `task_flow` 与 `tools` 维度显著提升
- CodeV、DataID、stale target 等 case 进入正确工具序列
- 新增一个同类场景时，默认只需补 playbook 数据和 eval case，不需改核心执行链路

### 阶段 E：结论结构化与多入口对齐

目标：

- 固定结论输出结构
- 再做多入口一致性

关键交付：

- `conclusion_schema`
- 现象/证据/判断/建议/待验证项输出模板
- 企微 / Orchestrator 对齐计划

验收关注：

- `conclusion` 维度稳定通过
- 同一 case 在主要入口结果差异可解释

## 3. 当前优先级

当前优先顺序固定为：

1. 阶段 A
2. 阶段 B
3. 阶段 C
4. 阶段 D
5. 阶段 E

没有完成前一阶段的主验收，不应跳过直接做后一阶段。

## 4. 开发组织方式

每一轮工作建议遵守以下顺序：

1. 先挑 3 到 5 个失分最高的 case
2. 归纳它们对应的共同缺口
3. 补设计契约
4. 补实现
5. 回跑评估
6. 更新进度文档

## 5. 本轮起始工作项

### 已完成

- 评估语料升级为链路型 schema
- grader 支持多维评分
- 主结论已明确：当前系统尚未达到排障 playbook 自动化

### 当前待推进

- 统一主入口口径
- 意图场景化
- 追问动作落地
- playbook schema 设计
- 工具覆盖清单整理
- playbook 外置化路径设计，避免新增 case 继续堆代码内 registry

## 6. 关联文档

- 评估结论：`../design/TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD`
- 目标设计：`../design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD`
- 验收标准：`./VERIFICATION.MD`
- 开发接力主入口：`./HANDOFF-LATEST.MD`
- 运行时状态页：`./V2-READINESS-STATUS.MD`
- 当前任务清单：`../../TODO.MD`
