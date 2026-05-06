# Workflow Orchestrator 设计规格

> 日期：2026-03-30
> 状态：设计已确认，待实现
> 目标：针对当前 `handoff / status / verify / TODO / project-context` 体系，建立**显式开发流程状态机 + 单一 workflow orchestrator**，把“当前状态是什么、下一步该做什么”从人工拼装改成统一判定与统一输出。

## 1. 背景

当前仓库已经具备较完整的续接资产与状态产物：

- `docs/verification/HANDOFF-LATEST.MD`：给人看的最新交接快照
- `docs/verification/V2-READINESS-STATUS.MD`：详细 readiness / 风险 / replaceability 状态页
- `v2/eval/reports/PROJECT-CONTEXT-LATEST.json`：机读上下文快照
- `TODO.MD`：当前主线、路线与未完成项
- `runtime:verify:core / runtime:status / runtime:handoff`：底层刷新入口

这些资产已经覆盖了“人类阅读”“机读状态”“验证入口”“交接快照”四类需求，但当前仍存在以下高频成本：

1. **验证成本高**：开发者很难快速知道当前最小必要验证是什么。
2. **状态刷新重复**：`handoff`、`status`、`verify` 之间的刷新顺序需要人为判断。
3. **文档与状态分散**：同一轮接手常常需要在多个文件之间来回切换。
4. **脏工作区接手成本高**：看到 dirty workspace 时，缺少统一的分类、解释和下一步建议。

因此，本轮设计不再继续为现有入口叠加轻量包装，而是上提一层**统一流程决策层**，把现有产物收口到同一个 workflow 编排语义下。

## 2. 设计目标

### 2.1 目标

本设计希望达成以下效果：

- 开发者或新 session 只需要面对**一个当前状态**。
- 系统始终返回**一个推荐下一步**，而不是并列给出多个需要自行判断的入口。
- `dirty workspace` 被视为**需要解释和分类的事实**，而不是一律报错或一律放行。
- `HANDOFF-LATEST.MD` 与 `V2-READINESS-STATUS.MD` 降级为**派生视图**，不再和流程决策入口并列竞争。
- 现有 `runtime:*` 能力继续复用，避免推翻当前成熟生成器。

### 2.2 非目标

本设计暂不覆盖以下事项：

- 不在本轮直接重写 `readiness-status.ts` 与 `project-context-status.ts` 的底层实现。
- 不在本轮直接改变 `runtime:verify:core / runtime:status / runtime:handoff` 的执行语义。
- 不在本轮引入新的完整验证体系，仍沿用当前 `core + compare 观察层` 口径。
- 不把 workflow 设计扩展为通用 CI/CD 编排器；本轮仅聚焦**日常开发接手/续接流程**。

## 3. 方案比较与推荐

### 3.1 方案 A：保留现有体系，只加统一入口层

做法：新增一个 `workflow` 命令，把当前 `runtime:*` 包一层，但底层决策依旧依赖开发者自行理解现有文档与状态页。

优点：

- 改动小
- 上线快
- 对现有资产扰动低

缺点：

- 只是“入口统一”，不是“流程统一”
- 无法解决状态判定分散与 dirty workspace 分类问题
- 长期仍会回到“要看多个文件拼出当前状态”的老问题

### 3.2 方案 B：显式状态机 + 单一 workflow orchestrator（推荐）

做法：引入一层显式的开发流程状态机；由 workflow orchestrator 统一读取现有事实源、计算状态、给出唯一下一步，并驱动派生产物刷新。

优点：

- 统一了**流程决策层**
- 继续复用现有 `runtime:*` 生成器和状态页
- 能显著降低续接、handoff、dirty workspace 判定成本
- 改造力度足够大，但风险仍可控

缺点：

- 需要补一层 machine-readable 流程事实源
- 需要建立状态判定优先级、错误边界与测试矩阵

### 3.3 方案 C：单一 orchestrator + 单一状态产物，全面替换现有视图

做法：完全把 `handoff/status/project-context` 收口为一个产物，旧产物全部退为历史兼容层。

优点：

- 最彻底
- 长期维护成本最低
- Source of Truth 最清晰

缺点：

- 对现有资产扰动过大
- 初期迁移风险最高
- 容易在切换期损失现有可读性与稳定性

### 3.4 推荐结论

本设计选择**方案 B**：

- 引入**显式状态机**与**单一 workflow orchestrator**
- 保留 `runtime:verify:core / runtime:status / runtime:handoff` 作为底层能力
- 保留 `HANDOFF-LATEST.MD` / `V2-READINESS-STATUS.MD` 作为派生视图
- 新增单一 machine-readable workflow 状态文件，承载流程层面的 Source of Truth

## 4. 总体设计

### 4.1 设计原则

1. **一个当前状态**：任何时刻只能返回一个 workflow state。
2. **一个推荐下一步**：默认只给一个最优先动作，避免并列建议。
3. **验证优先于展示**：当既缺验证又缺状态刷新时，优先要求补验证。
4. **保守放行**：状态机宁可保守阻塞，也不在高风险条件下误放行。
5. **展示与决策分离**：`HANDOFF-LATEST.MD`、`V2-READINESS-STATUS.MD` 负责展示，不负责成为并列决策入口。
6. **渐进迁移**：先引入 workflow 判定层，再逐步接入执行动作和派生输出。

### 4.2 现状与目标结构

当前流程本质上是：

- 人读 `HANDOFF-LATEST.MD`
- 再读 `V2-READINESS-STATUS.MD`
- 再看 `TODO.MD`
- 再看 dirty workspace
- 再自己决定是否要跑 `runtime:verify:core / runtime:status / runtime:handoff`

目标结构改为：

1. workflow orchestrator 统一读取现场
2. workflow state detector 产出唯一状态
3. workflow 给出唯一推荐动作
4. workflow action runner 视需要驱动底层 `runtime:*`
5. workflow status writer 写回单一机读状态文件
6. handoff / readiness 作为派生视图继续存在

## 5. 状态模型

### 5.1 状态列表

本设计定义 6 个显式状态：

1. `resume_needed`
2. `ready_to_develop`
3. `verification_needed`
4. `status_refresh_needed`
5. `handoff_ready`
6. `blocked`

### 5.2 各状态定义

#### `resume_needed`

含义：当前 session 还没有完成最基本的接手动作，系统无法确认开发者已经理解现场。

典型信号：

- 缺少最新 workflow 状态产物
- 缺少最新 handoff / context 产物
- 切回仓库后工作区已明显变化，但未完成流程级重新判定

推荐动作：

- `npm run workflow:resume`

#### `ready_to_develop`

含义：当前现场已可安全进入开发，且没有更高优先级的验证、刷新或阻塞事项。

典型信号：

- 当前状态已知
- 当前改动已分类
- 最小必要验证已满足
- 派生产物无需立即刷新

推荐动作：

- 进入编码或继续当前任务

#### `verification_needed`

含义：当前变更已经影响到运行时、回放、验证或关键流程入口，最小必要 gate 尚未执行。

典型信号：

- `v2/`、`scripts/test/`、`package.json`、`Makefile` 发生 relevant dirty changes
- 最近验证失败
- 最新验证结果已过期且不再可信

推荐动作：

- `npm run workflow:verify`

#### `status_refresh_needed`

含义：验证已足够，但派生状态页或 workflow 状态信息未刷新到最新。

典型信号：

- 验证通过但 `WORKFLOW-STATUS-LATEST.json` 仍是旧状态
- `V2-READINESS-STATUS.MD`、`HANDOFF-LATEST.MD` 与当前现场不一致
- 文档型变更已发生，但还未同步刷新状态页/交接页

推荐动作：

- `npm run workflow:refresh`

#### `handoff_ready`

含义：当前工作已到一个适合交接的稳定点，且 workflow 产物足够给下一 session 续接。

典型信号：

- 当前变更已完成本轮必要验证
- 状态页已最新
- 当前重点、风险、下一步已可描述

推荐动作：

- `npm run workflow:handoff`

#### `blocked`

含义：当前现场存在高风险不确定性，系统不能安全给出“继续开发”或“直接交接”的结论。

典型信号：

- 最近验证明确失败
- 关键产物缺失且无法推断最小安全动作
- dirty workspace 中存在未知高风险修改
- workflow 需要的事实源相互冲突

推荐动作：

- `npm run workflow:check`
- 或输出显式阻塞原因并要求先修复

## 6. 状态判定优先级

状态判定采用**优先级短路**，避免同一时刻出现多个并列结论：

1. `blocked`
2. `resume_needed`
3. `verification_needed`
4. `status_refresh_needed`
5. `handoff_ready`
6. `ready_to_develop`

判定原则如下：

- 一旦命中更高优先级状态，后续状态不再继续判定。
- `verification_needed` 永远高于 `status_refresh_needed`，因为验证优先于展示。
- `handoff_ready` 是“可以交接”的状态，不代表“必须交接”；但若用户请求刷新 handoff，应直接命中对应动作。
- `ready_to_develop` 必须是“没有更重要动作”的兜底状态，而不是默认状态。

## 7. 统一命令面

### 7.1 对开发者暴露的 workflow 入口

建议新增以下上层命令：

- `npm run workflow`
- `npm run workflow:resume`
- `npm run workflow:check`
- `npm run workflow:verify`
- `npm run workflow:refresh`
- `npm run workflow:handoff`

### 7.2 命令职责

#### `workflow`

统一总入口。

默认行为：

- 读取当前现场
- 判定当前状态
- 打印简洁状态摘要
- 输出唯一推荐下一步
- 在安全前提下可选择自动执行默认动作（初期建议仅展示，不自动执行）

#### `workflow:resume`

用于新 session 或续接场景。

职责：

- 汇总当前 workflow 状态
- 告诉用户当前重点、风险、dirty 分类和第一条推荐动作
- 必要时提示先补验证或先刷新状态

#### `workflow:check`

只读判定入口。

职责：

- 不执行任何底层动作
- 只计算并输出当前 workflow state、reason、requiredActions、recommendedCommand

#### `workflow:verify`

验证驱动入口。

职责：

- 按最小必要验证矩阵选择对应底层命令
- 初期默认优先复用 `runtime:verify:core`
- 如需 compare，再补 `runtime:compare`

#### `workflow:refresh`

状态刷新入口。

职责：

- 刷新状态页与 workflow 机读状态
- 典型情况下调用 `runtime:status`
- 再更新 workflow 状态文件

#### `workflow:handoff`

交接入口。

职责：

- 在必要时先确保状态页已刷新
- 再刷新 `HANDOFF-LATEST.MD`
- 最后写回 workflow 状态为 `handoff_ready` 或对应下一状态

### 7.3 与现有入口的关系

底层能力继续保留：

- `runtime:verify:core`
- `runtime:status`
- `runtime:handoff`
- `runtime:compare`

原则上：

- **workflow 层负责流程决策与推荐动作**
- **runtime 层负责具体生成、验证与落盘**

也就是说，`workflow:*` 是面向开发者的主入口，`runtime:*` 是底层能力层。

## 8. 单一机读流程事实源

### 8.1 新增产物

建议新增：

- `v2/eval/reports/WORKFLOW-STATUS-LATEST.json`

它将成为**流程层面的单一 machine-readable Source of Truth**。

### 8.2 数据契约

建议定义 `WorkflowStateReport`：

```json
{
  "timestamp": "2026-03-30T15:00:00.000Z",
  "state": "verification_needed",
  "reason": "runtime files changed and minimal gate not run",
  "currentFocus": "...",
  "dirtyHotspots": ["M README.MD"],
  "requiredActions": ["run minimal verify"],
  "recommendedCommand": "npm run workflow:verify",
  "lastVerifiedAt": "2026-03-30T14:10:00.000Z",
  "lastStatusRefreshAt": "2026-03-30T14:12:00.000Z",
  "artifacts": {
    "handoff": "docs/verification/HANDOFF-LATEST.MD",
    "readiness": "docs/verification/V2-READINESS-STATUS.MD",
    "projectContext": "v2/eval/reports/PROJECT-CONTEXT-LATEST.json"
  },
  "derivedFrom": {
    "todo": "TODO.MD",
    "git": "git status --short",
    "handoff": "docs/verification/HANDOFF-LATEST.MD",
    "readiness": "docs/verification/V2-READINESS-STATUS.MD",
    "projectContext": "v2/eval/reports/PROJECT-CONTEXT-LATEST.json"
  }
}
```

### 8.3 字段语义

- `state`：唯一当前状态
- `reason`：为什么命中该状态
- `currentFocus`：从 `TODO.MD` 或相关产物中提取的当前重点
- `dirtyHotspots`：当前最重要的 dirty 文件摘要
- `requiredActions`：到达安全状态前必须完成的动作
- `recommendedCommand`：默认唯一建议命令
- `artifacts`：当前关联派生产物
- `derivedFrom`：状态判定依赖的事实源
- `lastVerifiedAt / lastStatusRefreshAt`：用来判断验证与状态是否过期

### 8.4 与现有产物的职责划分

- `WORKFLOW-STATUS-LATEST.json`：**流程决策事实源**
- `HANDOFF-LATEST.MD`：**面向人的交接视图**
- `V2-READINESS-STATUS.MD`：**详细状态与风险展示视图**
- `PROJECT-CONTEXT-LATEST.json`：**工程上下文快照**

换句话说，现有 handoff/readiness 不被删除，但会被重新定位为**派生视图**，不再与 workflow 状态文件并列竞争“流程主入口”。

## 9. 组件边界与数据流

### 9.1 组件拆分

建议把 workflow 编排拆成 4 个组件：

1. `workflow-state-detector`
2. `workflow-action-runner`
3. `workflow-status-writer`
4. `workflow-presenter`

### 9.2 各组件职责

#### `workflow-state-detector`

职责：

- 读取 `git status`、`TODO.MD`、`HANDOFF-LATEST.MD`、`V2-READINESS-STATUS.MD`、`PROJECT-CONTEXT-LATEST.json`
- 基于优先级规则计算当前 workflow state
- 生成 `WorkflowStateReport`

#### `workflow-action-runner`

职责：

- 根据目标动作调用底层 `runtime:*`
- 负责将“验证”“刷新”“handoff”这些高层动作映射到底层命令
- 处理串行依赖，例如：先 `runtime:status` 再 `runtime:handoff`

#### `workflow-status-writer`

职责：

- 把最新 `WorkflowStateReport` 写入 `WORKFLOW-STATUS-LATEST.json`
- 必要时保留历史快照
- 统一更新时间戳与 artifact 引用

#### `workflow-presenter`

职责：

- 输出人类可读摘要
- 保证 CLI 展示简洁稳定
- 只强调当前状态、原因、唯一推荐下一步

### 9.3 固定数据流

固定数据流如下：

1. 读取现场
2. 判定状态
3. 生成 workflow report
4. 如有需要，执行动作
5. 重新判定状态
6. 写回 workflow 状态文件
7. 输出人类可读结果

## 10. Dirty Workspace 策略

### 10.1 基本原则

dirty workspace **不是错误本身**。

系统需要做的是：

- 分类
- 解释
- 判断风险
- 给出下一步

而不是看到 dirty 就直接报错，也不是一概视为可继续开发。

### 10.2 分类策略

建议将 dirty changes 分为三类：

1. **已知开发中 dirty**
2. **已知文档型 dirty**
3. **未知/高风险 dirty**

#### 已知开发中 dirty

典型示例：

- `v2/`
- `scripts/test/`
- `package.json`
- `Makefile`

策略：

- 默认进入 `verification_needed`
- 推荐最小必要验证命令

#### 已知文档型 dirty

典型示例：

- `README.MD`
- `CHANGELOG.MD`
- `docs/verification/`
- `TODO.MD`

策略：

- 默认进入 `status_refresh_needed` 或 `handoff_ready`
- 通常不强制 `runtime:verify:core`
- 但要求刷新状态页 / handoff

#### 未知/高风险 dirty

典型示例：

- workflow 无法识别其影响范围
- 关键生成器/状态文件/入口文件同时出现异常组合变更

策略：

- 优先进入 `blocked`
- 明确告诉用户为什么当前无法安全给出推荐动作

## 11. 最小必要验证矩阵

workflow 不应一律要求全量验证，而应根据改动范围决定最小 gate。

### 11.1 建议矩阵

- **runtime / replay / tests 改动**
  - 最小动作：`runtime:verify:core`

- **仅 compare 相关改动**
  - 最小动作：`runtime:compare`
  - 如同时影响 runtime，则先跑 `runtime:verify:core`

- **仅状态/交接文档改动**
  - 最小动作：`runtime:status` + `runtime:handoff`

- **仅部署/配置文档改动**
  - 通常不强制 runtime core
  - 但应刷新状态页 / handoff

- **跨层大改或影响未知**
  - 先跑 `runtime:verify:core`
  - 再决定是否补 `runtime:compare` 或完整状态刷新

### 11.2 判定原则

- 验证矩阵首先追求**足够安全**，其次才是**尽量省时**。
- 当前仓库的最小稳定 gate 仍以 `runtime:verify:core` 为第一优先。
- workflow 负责帮用户缩小验证范围，但不能为了省时间而误导为“无需验证”。

## 12. 错误处理与阻塞策略

### 12.1 进入 `blocked` 的条件

建议以下情况进入 `blocked`：

- 最近验证明确失败
- 关键 artifacts 缺失且无法推导安全下一步
- dirty changes 无法归类且影响范围高风险
- workflow 判定所依赖的事实源互相冲突

### 12.2 处理原则

- 状态机宁可保守，也不要误放行。
- `blocked` 必须输出**明确的阻塞原因**，而不是泛化报错。
- `blocked` 需要给出**恢复到可继续状态的最短路径**。

### 12.3 示例

如果出现“最近 `runtime:verify:core` 失败 + `HANDOFF-LATEST.MD` 仍显示旧的通过状态”，则 workflow 应优先返回：

- `state=blocked`
- `reason=latest verification failed but derived views are stale`
- `recommendedCommand=npm run workflow:check`
- `requiredActions=[修复验证失败, 再刷新状态页]`

## 13. 迁移策略

本设计采用渐进式迁移，不推翻现有体系。

### 阶段 1：只读状态机

目标：

- 实现 `workflow:check`
- 实现 `workflow:resume`
- 只做判定和展示，不执行底层动作

结果：

- 先验证状态模型是否准确
- 降低引入执行副作用的风险

### 阶段 2：接入执行动作

目标：

- 实现 `workflow:verify`
- 实现 `workflow:refresh`
- 实现 `workflow:handoff`

结果：

- workflow 不再只是解释状态，而是能推动最小必要动作

### 阶段 3：引入单一流程事实源

目标：

- 落地 `WORKFLOW-STATUS-LATEST.json`
- 让 presenter / handoff / IDE 面板都能消费该状态

结果：

- 流程决策层拥有单一机读真相源

### 阶段 4：旧入口降级

目标：

- 默认向开发者推荐 `workflow:*`
- `runtime:*` 明确定位为底层能力

结果：

- 形成“workflow 决策层 + runtime 执行层 + 文档展示层”的清晰分层

## 14. 测试与验收策略

### 14.1 单元测试

覆盖：

- 状态定义
- 优先级短路逻辑
- dirty workspace 分类
- 最小必要验证矩阵

重点：

- 相同输入必须稳定映射到同一状态
- 不同优先级冲突时必须返回最高优先级状态

### 14.2 集成测试

覆盖：

- `workflow:*` 到 `runtime:*` 的映射
- `refresh -> handoff` 的串行动作
- workflow 状态写回逻辑

重点：

- 动作执行顺序正确
- 状态文件与派生产物保持一致

### 14.3 回归测试

建议固化至少以下场景：

1. 新 session，状态干净，已完成验证
2. runtime 代码 dirty，但未验证
3. 仅文档 dirty，需要刷新 handoff
4. readiness 缺失，需要先刷新状态
5. 最近验证失败，需要进入 blocked
6. dirty 文件未知且高风险，需要进入 blocked

### 14.4 快照测试

覆盖：

- `workflow:check`
- `workflow:resume`
- 终端输出摘要

目标：

- 保证人类可读输出稳定、简洁、可追踪

### 14.5 Shadow Mode

推荐先以 shadow mode 上线：

- workflow 只做判定与建议
- 不替换现有主入口
- 持续对比 workflow 建议与开发者实际动作是否一致

当 shadow mode 证明状态判定稳定后，再把推荐入口从 `runtime:*` 切换到 `workflow:*`。

## 15. 验收标准

本设计落地后，至少应满足以下验收条件：

1. 新 session 能通过 `workflow:resume` 在一次输出内知道：
   - 当前状态
   - 当前重点
   - 当前风险
   - 当前 dirty 热点
   - 唯一推荐下一步

2. 同一工作区在不同时间重复执行 `workflow:check`，若事实源未变化，应得到同一状态。

3. 对 runtime 改动、文档改动、未知 dirty 三类场景，workflow 都能给出不同且合理的结论。

4. `HANDOFF-LATEST.MD` 与 `V2-READINESS-STATUS.MD` 继续存在，但用户默认推荐入口变为 `workflow:*`。

5. `WORKFLOW-STATUS-LATEST.json` 能成为 IDE、CLI、handoff、后续自动化的统一流程事实源。

## 16. 最终结论

本设计的核心不是再加一个命令别名，而是建立一个**显式状态机 + 单一 workflow orchestrator**，把当前仓库已经存在但分散的 handoff、readiness、project-context、TODO 与 git 现场统一收口。

推荐的落地顺序是：

1. 先实现只读判定层
2. 再接执行动作
3. 再固化单一 workflow 状态文件
4. 最后把 `workflow:*` 升级为默认推荐入口

这样既能解决“验证成本、状态刷新重复、文档/状态分散、脏工作区接手成本高”这四个核心痛点，也能避免一次性推翻当前已经成熟的 `runtime:* + handoff/readiness` 资产。
