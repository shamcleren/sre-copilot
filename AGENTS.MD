# AGENTS 规范（协同开发）

本文件作为 AI/自动化协同开发的统一规则，适用于本仓库所有文档与改动。

## 1. 文档目录与命名

- 所有 Markdown 文件名必须使用全大写（含扩展名 `.MD`）。
- 主设计入口为 `docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD`。
- 根目录只保留项目入口、变更记录、根工作清单和协作规范。
- 任何新增文档默认放入 `docs/` 下对应子目录，除非属于顶层入口。

## 2. 根工作清单规范

- 只有根工作清单文件允许出现英文待办标记。
- 其他文档使用“待办/清单/计划”等表述替代。

## 3. 路径书写规范

- 文档中的路径尽量使用相对路径或 `<PROJECT_ROOT>` 占位符。
- 避免硬编码绝对路径。

## 4. 文档引用与索引

- 新增或移动文档后，必须更新 `docs/DOCS-INDEX.MD`。
- 文档之间引用时，使用相对路径并保持文件名大写。

## 5. 目录结构约定

- `agent/` 是唯一业务 core，负责 contracts、policy、runtime、capabilities、adapters、audit 和 tests。
- `.pi/` 是后续 harness integration，只能通过 `agent/src/index.ts` 的公开 API 接入。
- `docs/` 当前只按 `design/superpowers/verification` 分组。
- `scripts/` 只承载稳定的开发与验收脚本；禁止恢复 legacy runtime、replay、compare、workflow 或部署别名。
- `v2/`、`eval/` 和旧报告家族不属于当前工作树；需要研究旧实现时使用 Git 历史。
- `docs/verification/` 以人类可读验收文档为主；纯机读报告只有在新阶段明确建立后才允许加入。

## 6. 变更记录

- 文档或结构调整需更新 `CHANGELOG.MD`（简要描述即可）。

## 7. 执行与验收纪律

- 遇到阻塞或失败时，优先修复根因，不采用绕过方案继续推进。
- 每个阶段必须先达到“可用 + 可验收”后再进入下一阶段，禁止带病流转。
- 长耗时任务默认采用可视化执行（分阶段进度可见），并及时同步当前状态与下一步。
- 验收结果必须可追溯：统一落盘报告到 `docs/verification/`，并保留通过/失败明细。
- 临时产物需尽快固化为稳定机制，避免遗留临时货。

如需变更规范，请在本文件中更新并同步到 `docs/DOCS-INDEX.MD` 与 `README.MD` 的入口说明。
