# SRE Copilot

SRE Copilot 正在以 Pi-compatible action runtime 的方向重新建立。旧 V2 runtime、评估链和运维工具已从当前工作树退役；历史快照保留在 Git 提交 `7f81522`。

## 当前状态

- Phase 0：遗留系统退役已完成；`npm run clean:start:verify` 是后续开发的前置门禁。
- Phase 1：尚未开始；只实现 `demo-service` 5xx 告警 fake vertical slice。
- 当前没有可连接生产环境的 runtime、部署入口或 Pi extension。

## 设计与计划

- 架构设计：`docs/design/SRE-COPILOT-PI-CORE-DESIGN.MD`
- Phase 0：`docs/superpowers/plans/2026-08-14-SRE-COPILOT-LEGACY-RETIREMENT-PLAN.MD`
- Phase 1：`docs/superpowers/plans/2026-08-14-SRE-COPILOT-PI-CORE-IMPLEMENTATION-PLAN.MD`
- 文档索引：`docs/DOCS-INDEX.MD`

## 安全边界

不要提交真实 `.env`、token、私钥、kubeconfig、Cookie、Authorization header 或生成的 Secret 文件。新 core 在接入任何真实系统前必须单独完成 adapter、权限、确认、审计和回滚评审。
