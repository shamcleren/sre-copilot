# AGENTS 规范（协同开发）

本文件作为 AI/自动化协同开发的统一规则，适用于本仓库所有文档与改动。

## 1. 文档目录与命名
- 所有 Markdown 文件名必须使用全大写（含扩展名 `.MD`）。
- 文档主入口在 `docs/`，设计文档以 `docs/design/TECHNICAL-DESIGN.MD` 为主文档。
- 根目录仅保留顶层入口文档与清单：`README.MD`、`CHANGELOG.MD`、`LOCAL-DEV-GUIDE.MD`、`DEPLOYMENT-GUIDE.MD`、`TODO.MD`、`AGENTS.MD`。
- 任何新增文档默认放入 `docs/` 下对应子目录，除非属于顶层入口。

## 2. TODO 规范
- 只有 `TODO.MD` 允许出现 “TODO” 字样。
- 其他文档请使用 “待办/清单/计划” 等表述替代。

## 3. 路径书写规范
- 文档中的路径尽量使用相对路径或 `<PROJECT_ROOT>` 占位符。
- 避免硬编码绝对路径（如 `/projects/sre-copilot`、`/data/workspace/sre-copilot`）。

## 4. 文档引用与索引
- 新增或移动文档后，必须更新 `docs/DOCS-INDEX.MD`。
- 文档之间引用时，使用相对路径并保持文件名大写。

## 5. 目录结构约定
- `docs/` 内按子域分组（design/tools/wecom/roadmap/security/verification 等）。
- `scripts/` 统一承载脚本，按 `deploy/dev/test/tools` 分类。
- `eval/` 仅承载共享验收基线、覆盖映射与共享/`V1` 机读报告。
- `v2/eval/` 仅承载 `V2` 专属 specs / runners / judges / reports。
- `docs/verification/` 以人类可读验收文档为主；纯机读 JSON 默认放到 `eval/reports/` 或 `v2/eval/reports/`，只有显式成对管理的报告家族例外。

## 6. 变更记录
- 文档或结构调整需更新 `CHANGELOG.MD`（简要描述即可）。

## 7. 执行与验收纪律（长期生效）
- 遇到阻塞或失败时，优先修复根因，不采用绕过方案继续推进。
- 每个阶段必须先达到“可用 + 可验收”后再进入下一阶段，禁止带病流转。
- 长耗时任务默认采用可视化执行（分阶段进度可见），并及时同步当前状态与下一步。
- 验收结果必须可追溯：统一落盘报告到 `docs/verification/`，并保留通过/失败明细。
- `docs/verification/LOCAL-VERIFY-*.MD` 采用滚动保留策略：仅保留最新 5 份，超出部分按时间戳从旧到新清理。
- `docs/verification/PLAYBOOK-COVERAGE-VERIFY-*.MD` 采用滚动保留策略：仅保留最新 5 份，超出部分按时间戳从旧到新清理。
- `docs/verification/BROWSER-REGRESSION-*.MD/.JSON` 采用滚动保留策略：仅保留最新 6 份（同名 MD/JSON 成对清理）。
- `docs/verification/CHATOPS-PARSE-MATRIX-*.MD/.JSON` 采用滚动保留策略：仅保留最新 3 份（用于最近回归对比）。
- `docs/verification/FULL-TEST-RUN-*.MD` 采用滚动保留策略：仅保留最新 5 份。
- `docs/verification/ONLINE-VERIFY-*.MD` 采用滚动保留策略：仅保留最新 5 份。
- `docs/verification/LLM-CROSS-BENCHMARK-*.MD/.JSON` 采用滚动保留策略：仅保留最新 3 份（成对清理）。
- `docs/verification/BROWSER-LIVE-*.json` 采用滚动保留策略：仅保留最新 1 份。
- `docs/verification/EXPERT-DIAGNOSIS-ENTRY-*.JSON` 与 `docs/verification/BROWSER-P3-POLICY-*.JSON` 采用滚动保留策略：各仅保留最新 3 份。
- 历史里程碑/阶段总结报告统一放入 `docs/verification/ARCHIVE/`，主目录仅保留当前窗口常用文档与最近滚动产物。
- 临时产物需尽快固化为稳定机制（脚本、规范、文档），避免“临时货”遗留。

---

如需变更规范，请在 `AGENTS.MD` 中更新并同步到 `docs/DOCS-INDEX.MD` 与 `README.MD` 中的入口说明。
