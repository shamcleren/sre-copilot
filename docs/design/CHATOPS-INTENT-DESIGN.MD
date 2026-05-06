# ChatOps 意图与下线方案设计

> ⚠️ 文中若出现 `v1/src/` 路径，均属于历史设计快照；当前仓库已删除 `v1/`，实现请以 `v2/` 与现行 ChatOps 验收链为准。
> 本文档说明当前意图识别问题的根因、系统化解决方向，以及「及时止损」的下线选项。
> 主文档：`docs/design/TECHNICAL-DESIGN.MD`。

## 1. 问题诊断

### 1.1 现象

- 用户反复遇到「单点误判」：如「用户 X 没有绑定 Y 吗」被当成变更类、「删除 m1 开头的用户」被识成删工具等。
- 每次修复都是**补丁式**：在 `detectCapability` 或规则里加一条正则/分支，没有统一契约，回归靠零散单测。

### 1.2 根因

1. **意图入口分散**
   意图由多处共同决定，没有单一真相来源：
   - `detectCapability(text)`：仅凭少量关键词判 read/write/diagnosis，易误判（如含「绑定」即 write）。
   - 多条分支：JSON、LLM 结构化、自然语言规则、上下文补全、LLM 兜底等，**先后顺序和互斥关系**依赖实现细节，难以推理。
   - 最终兜底：`buildCapabilityClarificationGuide(text)`，仍依赖同一套 `detectCapability`。

2. **缺少「问句 vs 指令」的一阶分类**
   - 「有没有/是否/吗/谁/哪些」等**问句**应与「注册/删除/绑定」等**指令**在**最早**阶段区分开。
   - 当前是「先按 capability 分 read/write，再在各自分支里处理」，问句若命中写操作关键词就会误入 write 分支。

3. **没有意图回归矩阵**
   - 没有一份**权威用例表**（utterance → 期望意图/期望动作或 guide 类型）在 CI 中强制跑通。
   - 修一个 case 容易带崩另一个，且难以发现。

---

## 2. 系统化方案（建议方向）

若**保留并改进** ChatOps，建议做以下收敛，避免继续打补丁。

### 2.1 意图一阶分类（问句 vs 指令）

- **在解析最前**增加一层：**仅做「问句 / 指令」二选一**（可选：加一个「未知」交给后续）。
- **问句**：句末 吗/？、含有 有没有/是否/谁/哪些/多少/为什么 等；或 LLM 输出 `readQuery.type`。
  → 只走「读路径」：`resolveReadQuery`、`buildReadOnlyGuide`、或查询类 guide，**绝不**走 write 分支或「变更类请补充参数」。
- **指令**：明确祈使或结构化（如「删除用户中以 m1 开头的」）。
  → 走现有写路径（矩阵 + 自然语言规则 + LLM 兜底）。
- **实现要点**：
  - 问句判定可先**规则为主**（正则/关键词），再对歧义句用 LLM 的 `readQuery` 辅助；规则与 LLM 的边界写进文档。
  - `detectCapability` 改为**仅在「已判为指令」时**使用，或与「问句/指令」层合并为一套明确优先级（例如：先问句 → read；再 write 矩阵 → write；再 LLM → 其他）。

### 2.2 单一决策顺序与文档化

- 将 `parseChatOpsInput` 的**分支顺序**整理成一张「决策表」或流程图，写进本文档或 TECHNICAL-DESIGN：
  - 例如：空 → JSON → **问句? → read 路径** → **指令? → write 矩阵** → 自然语言规则 → LLM 结构化 → … → 兜底 guide。
- 新增/调整分支时，必须同步更新该表，避免「隐藏顺序」导致再次出现问句误入 write 的情况。

### 2.3 意图回归矩阵 + CI

- 建立**唯一用例表**：例如 `v1/src/services/__tests__/chatops-utterance-matrix.ts`（或 JSON），每行：(utterance, expectedIntent?, expectedActionsType?, expectedGuideContains?）。
- **所有**对意图/guide 的修改，必须：
  - 在矩阵中**新增或更新**用例；
  - 通过 `npm test -- chatops-utterance-matrix`（或等价）且**不得**删减已有用例（除非明确废弃场景）。
- CI 强制跑该用例表，保证修一个 case 不破坏其他。

### 2.4 落地节奏

- 短期：先做 **2.1 问句 vs 指令一阶分类** + **2.3 回归矩阵**，可显著减少「问句被当变更」类问题。
- 中期：按 **2.2** 把现有 `parseChatOpsInput` 分支顺序文档化并收口，再逐步把 `detectCapability` 收进「仅对指令生效」的路径。

---

## 3. 下线选项（及时止损）

若当前**不投入**系统化改造，建议直接**关闭 ChatOps 能力**，避免继续堆积单点修复成本。

### 3.1 开关

- **环境变量**：`CHATOPS_ENABLED`
  - `false` 或 `0`：视为关闭；**未设置或为 true/1**：保持现有行为（向后兼容）。
- **行为**：当 ChatOps 关闭时，`parseChatOpsInput` 在入口（空输入检查之后）直接返回：
  - `actions: []`
  - `guide: 'ChatOps 能力暂未开放，请稍后再试或联系管理员。'`
  - `intent: 'unknown'`
  - `normalizedFrom: 'none'`
- **影响范围**：
  - 所有依赖 `parseChatOpsInput` 的接口（如 `/api/admin/chatops/parse`、`/api/admin/chatops/parse-stream`、`/api/admin/chatops/execute`）都会得到「无动作 + 上述 guide」；
  - 管理端/企微等 ChatOps 入口可据此展示「暂未开放」或隐藏入口。

### 3.2 使用方式

- 部署时在环境或配置中设置 `CHATOPS_ENABLED=false`（或 `0`）。
- 若使用 K8s/ConfigMap，增加该变量即可，无需改代码即可下线。

### 3.3 与系统化方案的关系

- 下线后，若将来实施 **§2** 的系统化方案，可在完成「问句/指令 + 回归矩阵」后再将 `CHATOPS_ENABLED` 设为 true 重新开放，避免在未收口前继续暴露给用户。

---

## 4. 建议决策

| 选项 | 适用情况 |
|------|----------|
| **实施 §2 系统化方案** | 希望长期保留 ChatOps，且能投入时间做意图一阶分类 + 回归矩阵 + 决策顺序文档化。 |
| **启用 §3 下线** | 当前以止损为主，暂不投入系统化改造；通过 `CHATOPS_ENABLED=false` 关闭能力，待方案就绪后再开放。 |

---

## 5. 变更记录

- 2026-02：初版，问题诊断 + 系统化方案 + 下线选项与实现要点。
