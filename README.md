# SRE Copilot：从零手写可观测 Agent

Go + tRPC-Agent-Go 的学习工程，目标是亲手实现一个能通过指标、日志、Trace 和知识资料辅助排障的 Agent。旧 AI 原型留在 `main` 和 Git 历史中，新起点位于 `codex/agent-from-zero`。

## 当前能运行什么

已准备模型配置、命令行入口、tRPC Agent/Runner 接线、取消与超时、结构化日志、本地模拟接口测试和 CI。依赖固定为 `trpc-agent-go v1.11.2`，项目工具链固定为 Go 1.27.3；Go 1.21+ 在默认 `GOTOOLCHAIN=auto` 下会自动下载使用，不修改系统 Go。

当前只注册一个只读工具 `bk_cli_monitor`。它执行本机 `bk-cli version` 和 `bk-cli monitor` 的允许模块，拒绝 `update`、`--check_update` 和变更类子命令。查询、凭据和权限仍由 `bk-cli` 完成。设置 `SKILLS_ROOT` 后，模型先按需加载其中的 `bk-monitor` 技能，再调用命令；不设置时只靠工具说明和 `--help`。技能原文不进入本仓库。

## 开始开发

在你平时使用的 `sre-copilot` 克隆目录操作：

```sh
git switch codex/agent-from-zero
make setup
# 用编辑器填写本机 .env 的三个 LLM_* 字段
make doctor
make run PROMPT='Pod 是 Running，就一定可以接收流量吗？'
```

`LLM_BASE_URL` 填服务商 API 前缀，如 `https://provider.example/v1`，不要填完整的 `/chat/completions` 路径。`.env` 被 Git 忽略；`make setup` 不覆盖已有文件。已导出的环境变量优先于 `.env`，显式空值也优先。配置文件按 dotenv 数据读取，不需要执行 `source .env`。

`make doctor` 只校验格式及必填项，不验证连接或密钥有效性，也不发模型请求。`make run` 才会请求所配置的模型并产生相应费用。`REQUEST_TIMEOUT` 限制整个运行；`MAX_LLM_CALLS` 限制模型调用与工具迭代次数。Ctrl-C 会取消本轮任务。

```sh
make check  # 格式、vet、本地模拟接口测试；不需要真实密钥
make race   # 并发检查
make build  # bin/sre-copilot
./bin/sre-copilot --help
```

回答输出到 stdout，JSON 日志输出到 stderr，可分别保存：

```sh
mkdir -p artifacts
./bin/sre-copilot --prompt '解释 Service 与 EndpointSlice 的关系' \
  > artifacts/answer.txt 2> artifacts/events.jsonl
```

日志包含 `run.started`、`model.started`、`model.completed`、`agent.event`、`run.completed`，通过 `run_id` 和 `call_id` 关联；记录状态、耗时和可用的 Token 用量。服务商未返回可用计数、或 SDK 只提供零值时，`usage_reported=false`，不能把零当作实际免费。非流式请求暂不计算首 Token 延迟，也不能仅凭 Token 数推算账单。

默认不记录问题、回答、工具参数、鉴权头或服务商原始错误正文。为避免 SDK 默认日志向 stdout 输出原始错误，CLI 使用自己的结构化事件并关闭 SDK 默认日志。模型失败时给出固定错误提示；详细排查应核对配置与服务商状态，不要把密钥加入调试日志。`artifacts/` 被忽略，回答文件仍应按私密数据保管。

## 先读哪几处代码

```text
cmd/sre-copilot/main.go           信号取消与进程退出
internal/cli/cli.go               参数、doctor、输入输出
internal/config/config.go         私密配置及校验
internal/app/app.go               Model → LLMAgent → Runner → 事件消费
internal/observability/logging.go  JSON 日志出口
internal/sretools/registry.go      你开始写工具的位置
```

先沿一次请求读完这条路径，运行本地测试，解释“为什么要消费到事件通道关闭”“超时约束哪一段”“没有 Usage 时能断言什么”。助手准备的接线和测试不作为学习者已经掌握的证据。

## 只读观测命令

`internal/sretools/monitor.go` 把 `bk-cli` 收成工具参数，不经过 Shell。允许 `version`、`monitor --help`，以及 `log`、`metric`、`alert`、`apm`、`analysis`、`dashboard`、`resource`、`space`、`status`、`tools`。`tools` 只允许 `schema` 和 `search`。大输出截断后写入仅本人可读的临时文件。模型循环仍是 tRPC `Runner`：同一个模型看到工具结果后再决定下一步。

本机准备：

```sh
# SKILLS_ROOT 指向包含 bk-monitor/SKILL.md 的目录；没有技能目录时留空
# BK_CLI_PATH 可留空，默认使用 PATH 中的 bk-cli
make run PROMPT='看下最近 15 分钟有没有错误日志'
```

## 结合教材

配套阅读：李博杰《深入理解 AI Agent：设计原理与工程实践》v1.3（2026-07-31）。教材 PDF 保留在个人资料目录，不复制进公开代码仓库。

| 当前代码与后续步骤 | 阅读位置 | 核对重点 |
| --- | --- | --- |
| 读懂现有模型接线 | §2.2.1—2.2.2；书内29—30页、PDF37—38页 | 消息角色、请求、返回、错误、超时 |
| 亲手实现第一个工具 | §2.2.3—2.2.4、第4章 | 参数、执行、回填、停止条件 |
| 知识与记忆 | 第3章、§2.7 | 分块、元数据、上下文、写入和纠错 |
| 可观测性与评测 | §6.8、第6章 | 因果链、状态与耗时、固定案例和回归 |

书中示例用于理解原理，具体 API 按锁定版本的 SDK 源码核对。主线使用 Go + tRPC-Agent-Go；Pi 作为状态、循环和事件设计的对照，不要求同时维护第二套实现。

## Git 与子模块

平时在自己的 `sre-copilot` 克隆目录开发、提交并推送本分支。生活库中的 `.projects/sre-copilot` 是同一远端的独立子模块工作副本，父仓库只记录提交指针。两个目录不会自动同步：代码分支先提交推送，子模块快进到该提交后，再在父仓库提交指针。

不要把新实现强行覆盖到保留旧原型的 `main`；需要合并时单独评审。

## 版本依据

- [tRPC-Agent-Go v1.11.2](https://github.com/trpc-group/trpc-agent-go/tree/v1.11.2)
- [SDK 模型回调](https://github.com/trpc-group/trpc-agent-go/blob/v1.11.2/model/callbacks.go)
- [SDK 可观测性文档](https://github.com/trpc-group/trpc-agent-go/blob/v1.11.2/docs/mkdocs/en/observability.md)
- [Pi Agent Core 对照](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)

本机原 Go 1.22.1 在 macOS 26 启动测试时出现 `missing LC_UUID`。工程通过独立工具链解决；机制见 [Go 工具链文档](https://go.dev/doc/toolchain)，相关系统兼容问题见 [Go issue 68678](https://github.com/golang/go/issues/68678)。首次准备需要联网下载工具链与依赖，后续本地模拟测试不需要模型网络。
