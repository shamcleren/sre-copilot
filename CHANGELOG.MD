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

### Phase 1 计划收敛（2026-08-17）

- 将 Phase 1 实施计划收敛为最小可读核心：目录职责、函数命名、实现骨架、测试步骤和官方参考地址。
- 明确 v0 只覆盖单步骤 fake 告警的 inspect → preview → approve → apply → verify 主路径，复杂边界拆到后续独立计划。
