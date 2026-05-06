# 验收标准（排障自动化）

> 本文档定义当前有效的验收标准。
> 主验收基线：`eval/corpus.json`。

## 1. 验收对象

当前阶段的主验收对象是：

- 外部服务入口 `POST /api/chat`
- 对应的回放 / compare / readiness 产物
- 对应的排障主链路 metadata

企微 / Orchestrator / 其他入口暂不作为主门禁，但后续应逐步对齐。

## 2. 基线资产

- 语料：`eval/corpus.json`
- grader：`eval/grade-response.js`
- 主执行入口：`npm run workflow:verify`（默认流程入口，对应纯 `V2` 主回归） / `npm run workflow:refresh`（默认刷新 readiness）；只有在明确需要绕过编排层时，才直接调用对应底层脚本
- `eval/run-eval.sh`：仅保留 corpus 预览入口（`--dry-run`），不再执行历史 `srectl` 远端评估链

### 2.1 目录职责

- `eval/`：共享基线、coverage map 与共享/`V1` 机读结果（如 `eval/reports/results-*.json`、`eval/reports/REPLAY-*.json`、`eval/reports/EFFECT-TUNING-REPLAY-*.json`）
- `v2/eval/`：`V2` 专属 specs / runners / judges / reports（如 `v2/eval/reports/COMPARE-*.json`、`READINESS-*.json`、`PROJECT-CONTEXT-*.json`）
- `docs/verification/`：人类可读的验收标准、矩阵、状态页与滚动报告；不再作为纯机读 JSON 的默认落盘目录

### 2.2 活跃回归资产

- `eval/effect-tuning-cases.json`：当前 `V1 replay` 主 case 基线；`scripts/test/test-effect-tuning-replay.js` 默认读取它，并作为 `V1 / V2 compare` 的共享 case 来源
- `eval/effect-tuning-release-gate.json`：最小发布守门集，固定覆盖 A/B/C/D/E 各 1 个代表 case，并显式覆盖“能定位继续查 / 不能定位先补材料 / 用户说法有误先证伪 / 通过实体关联串起证据”四类主链分支
- `eval/effect-tuning-cases-bkop.json`：保留中的迁移备份资产；当前不作为默认执行入口，但仍是 `V2` case 迁移与回放重构的参考基线，不应当作临时噪音删除
- `scripts/test/test-effect-tuning-replay.js`：生成 baseline effect-tuning 回放报告，默认把 `BASELINE-REPLAY-*.json` 写入 `eval/reports/`；当 `CASES_FILE=eval/effect-tuning-release-gate.json` 时即作为最小发布守门入口；根脚本别名现优先使用 `npm run replay:baseline` / `npm run replay:baseline:gate`
- `v2/eval/runners/compare-v1-v2.ts`：读取最新 baseline replay 报告（匹配 `BASELINE-REPLAY-*` 或旧 `EFFECT-TUNING-REPLAY-*`）与 `V2 replay suite`，生成 V1 / V2 strict compare
- `scripts/test/verify-v2-core.sh`：纯 `V2` core 回归入口，串联 typecheck、runtime regression、smoke 与 replay
- `scripts/test/verify-v2-regression.sh`：当前完整 `V2` 回归入口，兼容现有 `v2:verify` / `v2:verify:full` / `runtime:verify:full`；现阶段与 core gate 等价
- `npm run runtime:compare`：读取 `eval/` 中保留的历史 baseline replay 报告与 `V2 replay suite`，生成 V1 / V2 strict compare，作为观察层使用
- `scripts/test/report-v2-readiness.sh`：默认执行 `core gate`，并以纯 `V2 baseline` 生成 `docs/verification/V2-READINESS-STATUS.MD`、`v2/eval/reports/READINESS-*.json`；脚本随后会同步刷新 `PROJECT-CONTEXT-LATEST.json` 与滚动保留最近 5 份 `PROJECT-CONTEXT-*.json`，供跨 session 续接与开发 handoff
- `docs/verification/HANDOFF-PROTOCOL.MD` + `docs/verification/HANDOFF-LATEST.MD`：固定 handoff 协议与最新人类可读交接快照；其中 `HANDOFF-LATEST.MD` 默认由 `npm run workflow:handoff` 自动刷新

## 3. 核心验收维度

每条排障 case 至少从以下五个维度验收：

1. `intent`
2. `task_flow`
3. `interaction`
4. `tools`
5. `conclusion`

### 3.1 intent

检查点：

- 是否识别为正确排障意图
- 是否进入正确场景或子场景
- 是否识别出需要澄清或补材料

### 3.2 task_flow

检查点：

- 是否走了正确的排障顺序
- 是否在正确阶段停止继续猜测
- 是否能把多轮推进保持在同一主目标下

### 3.3 interaction

检查点：

- 缺证据时是否先追问
- 追问内容是否具体且与下一步排查有关
- 是否给出可执行的材料采集方式

### 3.4 tools

检查点：

- 是否调用对的工具
- 工具调用数量、顺序、参数是否合理
- 是否基于工具结果推进下一步

### 3.5 conclusion

检查点：

- 是否给出明确现象
- 是否引用已确认事实
- 是否区分“已确认”和“推断”
- 是否给出建议动作和待验证项

## 4. 通过标准

当前建议门槛：

- 单 case 总分达到 `pass_threshold_pct`
- `intent` 不允许为 0 分
- `interaction` 对于需要补材料的 case 不允许为 0 分
- `conclusion` 若输出了确定根因，必须有证据支撑

## 5. 变更规则

以下变更必须同步更新语料或 grader：

- 新增排障场景
- 修改意图分类逻辑
- 修改工具选择策略
- 修改引导交互逻辑
- 修改结论输出结构

## 6. 执行建议

### 6.1 日常开发

- 日常续接先运行 `npm run workflow:resume`
- 修改运行时/统一入口后，优先运行 `npm run workflow:verify`
- 需要查看 corpus 覆盖范围时，可运行 `./eval/run-eval.sh --dry-run`
- 需要观察历史 baseline 差异时，运行 `npm run runtime:compare`
- 需要刷新状态页与交接快照时，优先运行 `npm run workflow:refresh`、`npm run workflow:handoff`
- 走统一本地离线验收时，使用 `make verify-local VERIFY_STAGE=tests`

### 6.2 准备真实联调时

- 使用真实远端环境执行 API / Web Chat / WeChat 联调，不再使用 `eval/run-eval.sh` 直连旧 CLI
- 联调前后建议至少执行一次 `npm run workflow:resume`；如需要留存最新接手现场，再刷新 `npm run workflow:handoff`
- 记录失败 case 的维度失分，而不是只看总分

## 7. 结果解释

评估结果应按“维度失分 -> 设计缺口 -> 代码改动”来解释。

不建议的做法：

- 只看总分
- 只靠关键词命中解释通过
- 用临时 prompt 微调掩盖系统性缺口

## 8. 文档联动

- 设计判断：`../design/TROUBLESHOOTING-AUTOMATION-ASSESSMENT.MD`
- 目标设计：`../design/TROUBLESHOOTING-AUTOMATION-DESIGN.MD`
- 分阶段计划：`./ITERATION-PLAN.MD`
- 开发接力协议：`./HANDOFF-PROTOCOL.MD`
- 开发接力主入口：`./HANDOFF-LATEST.MD`
- 当前任务清单：`../../TODO.MD`
