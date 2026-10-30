# SRE Copilot：从零手写可观测 Agent

Go + tRPC-Agent-Go 的学习工程，目标是亲手实现一个能通过指标、日志、Trace 和知识资料辅助排障的 Agent。旧 AI 原型留在 `main` 和 Git 历史中，新起点位于 `codex/agent-from-zero`。

## 当前能运行什么

已准备模型配置、命令行入口、tRPC Agent/Runner 接线、取消与超时、结构化日志、本地模拟接口测试和 CI。依赖固定为 `trpc-agent-go v1.11.2`，项目工具链固定为 Go 1.27.3；Go 1.21+ 在默认 `GOTOOLCHAIN=auto` 下会自动下载使用，不修改系统 Go。

当前工具注册表为空。每次请求使用新的内存会话；持久记忆、知识库、真实观测系统、Trace 导出和诊断逻辑将在学习过程中逐步实现。模型在此阶段只能解释问题，不能查询真实服务。

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

## 第一份业务代码：只读 503 案例工具

从 `internal/sretools/registry.go` 开始，亲手实现并注册 `read_incident_snapshot`：输入服务名，返回 `testdata/incidents/service-a-503.json` 的本地教学快照。只允许已知服务，不接受任意路径、Shell 或 URL。未知服务返回可解释错误，支持 context 取消，输出保留来源、版本和时间。

快照是教学假设，不是真实事故，也没有预先确定根因。先写工具本身的测试，再用模拟模型完成“提出工具调用 → 执行 → 按 tool_call_id 回填 → 模型继续 → 最终回答”。核对 Agent 不能把快照没有的证据编造成查询结果。当前只推进这一个工具，随后才接指标、检索和记忆。

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
