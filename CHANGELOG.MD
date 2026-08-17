# 变更记录

## [未发布]

### Phase 0：干净基线（2026-08-17）

- 旧 V2 runtime、共享 eval、replay/compare/workflow、运维脚本和旧活跃文档入口已从工作树退役。
- 根 npm 入口和依赖已收敛为新 `agent/` core 所需的 TypeScript 工具链。
- 新增 `npm run clean:start:verify` 和 `docs/verification/LEGACY-RETIREMENT-ACCEPTANCE.MD`。
- 遗留系统最后一个已推送快照保留在 Git 提交 `7f81522`。

### Pi Core 设计（2026-08-14）

- 新增 Pi-compatible action runtime 架构设计。
- 新增 Phase 0 遗留系统退役计划和 Phase 1 fake 告警 vertical slice 实施计划。
