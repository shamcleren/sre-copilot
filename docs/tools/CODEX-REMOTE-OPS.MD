# CODEX 远程运维命令

## 目的

提供给 Codex 使用的远程运维封装，便于在开发完成后直接执行：

- 拉取最新代码
- 维护远端既有 dev 实例（`deploy-local` 为 legacy 动作）
- 获取健康状态
- 运行测试

该能力与系统内工具 `ssh_remote_management` 并行存在：

- `ssh_remote_management`：面向系统内 Tool 调用链
- `CODEX-REMOTE-OPS.SH`：面向 Codex 终端命令编排

## 脚本位置

- `scripts/tools/CODEX-REMOTE-OPS.SH`

## Make 入口

- `make codex-deploy-local`（legacy：远端拉代码并触发 `local-restart-bg`，仅维护既有 dev 实例）
- `make codex-status`
- `make codex-health`
- `make codex-test-no-llm`（兼容占位，实际会提示改用 `npm run v2:test`）
- `make codex-test-report [AUTH_TOKEN=<token>]`
- `make codex-test-report-push [AUTH_TOKEN=<token>] [REPORT_COMMIT_MSG='test: add full test run report']`
- `make codex-exec CMD='git status --short --branch'`

## 环境变量

- `REMOTE_HOST`（默认 `dev`）
- `REMOTE_PATH`（默认 `/data/sre-copilot`）
- `BASE_URL`（默认 `http://127.0.0.1:3001`）
- `AUTH_TOKEN`（可选；为空时自动回退到远程 `.env.secrets` 的 `ADMIN_BOOTSTRAP_TOKEN`）
- `REPORT_COMMIT_MSG`（`codex-test-report-push` 提交信息，可选）

## 推荐流程：远程产出报告并本地读取

1. 远程执行并推送报告：
   - `make codex-test-report-push`
2. 本地拉取：
   - `git pull --ff-only`
3. 本地查看：
   - `docs/verification/FULL-TEST-RUN-*.MD`
