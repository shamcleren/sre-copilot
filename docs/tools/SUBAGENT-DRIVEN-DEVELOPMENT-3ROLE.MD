# Subagent-Driven Development（三角色方案）

> 目标：用“文档 / 开发 / 测试”三角色子代理替代人工调度，降低沟通成本与遗漏风险。

## 1. 方案位置

- Skill 目录：`.cursor/skills/subagent-driven-development-3role/`
- 主文件：`.cursor/skills/subagent-driven-development-3role/SKILL.md`
- 角色模板：
  - `DOC-ROLE-PROMPT.MD`
  - `DEV-ROLE-PROMPT.MD`
  - `TEST-ROLE-PROMPT.MD`
- 编排清单：`ORCHESTRATION-CHECKLIST.MD`

## 2. 三角色职责

- 文档角色（Doc）
  - 定义边界、验收标准、影响文档。
  - 做文档收口（`CHANGELOG.MD` / `docs/DOCS-INDEX.MD`）。
- 开发角色（Dev）
  - 仅按规格实现，给出定向验证命令。
- 测试角色（Test）
  - 先定向验证，再决定扩展回归；结论需证据化。

## 3. 执行流程（每个任务）

1. 主控读取任务并创建 Todo（单任务 in_progress）。
2. Doc 输出规格门禁（边界 + 验收标准）。
3. Dev 按规格实现并自检。
4. Test 验证并回传证据。
5. Doc 收口文档并确认门禁完成。

## 4. 项目固定约束

- 部署口径：`./scripts/deploy/deploy-remote.sh`
- 远程连接口径：`ssh dev`
- 验收报告目录：`docs/verification/`
- `LOCAL-VERIFY-*.MD` 仅保留最新 5 份
- 仅 `TODO.MD` 允许出现 “TODO”
- 未被明确要求时，不执行 `git commit`

## 5. 推荐使用方式

在主会话开场输入：

```text
使用 subagent-driven-development-3role 执行本任务：
按 文档 -> 开发 -> 测试 顺序推进；
每一步输出“结果+证据+下一步”；
若任一门禁不通过，停止并返回修复清单。
```

## 6. 与现有文档协同

- 任务来源：`TODO.MD`
- 迭代与验收：`docs/verification/ITERATION-PLAN.MD`
- 路线口径：`docs/roadmap/ROADMAP.MD`
- 验收规范：`docs/verification/VERIFICATION.MD`
