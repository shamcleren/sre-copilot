# SRE Copilot 工作清单

> 当前只跟踪新 Pi Core 路线；旧系统进展保留在 Git 历史。

## Phase 0：遗留系统退役

- [x] 确认远端历史锚点 `7f81522`。
- [x] 删除旧 runtime、共享 eval 和 npm 入口。
- [x] 删除旧配置、部署、本地运行和运维脚本。
- [x] 删除旧活跃文档并重写项目入口。
- [ ] 建立 clean-start guard 并落盘验收记录。

## Phase 1：Pi Core fake vertical slice

- [ ] Phase 0 验收通过后，按实施计划逐 task 执行。
- [ ] 只实现 `demo-service` 5xx 告警创建。
- [ ] 完成离线 typecheck、测试和可追溯验收报告。
