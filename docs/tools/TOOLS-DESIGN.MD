# 工具系统设计（MCP / Skills / Script / Shell / K8s）

工具为 Agent 提供可调用能力，支持多种类型，统一由注册中心注册、按 `kind` 分发执行。

> ⚠️ 本文档中的 `v1/src/` 路径属于历史实现快照。当前仓库已删除 `v1/`，实现定位请优先参考 `v2/` 与现行工具脚本。
> 当前实现以 `builtin / mcp / skill / script / shell` 五类 `kind` 为准。
> K8s 管理能力当前通过 builtin `k8s-management` 暴露，而不是独立 `kubectl` kind。

## 工具类型（kind）

| kind     | 说明           | 执行方式           | 安全边界           |
|----------|----------------|--------------------|--------------------|
| **builtin** | 进程内函数     | 直接调用 `handler` | 无外部调用         |
| **mcp**     | MCP 服务器工具 | 调用 MCP 客户端   | 依赖 MCP 配置      |
| **skill**   | 技能（如 Cursor Skill） | 按 skillId 分发 | 依赖技能运行时     |
| **script**  | 项目内脚本     | 子进程执行脚本     | 仅允许目录 + 解释器白名单 |
| **shell**   | Shell 命令     | 白名单命令 + 参数占位 | 仅允许命令前缀 + 无自由拼接 |

## 类型定义与注册

- **类型**：当前类型体系仍是 `ToolKind / BuiltinTool / McpTool / SkillTool / ScriptTool / ShellTool`；文中 `v1/src/services/tools/types.ts` 仅代表历史实现位置。
- **注册**：`registerTool(tool: Tool)`，执行：`executeTool(name, params)`。
- **列表**：`listTools()` / `listToolsForLLM()`（含 `kind`），HTTP：`GET /api/tools`（可选 `userId` 或 `roleIds=a,b`）。

## 各类型说明

### builtin

- 进程内异步函数，无 IO 或仅访问已注入依赖。
- 示例：`get_current_time`（见 `builtin.ts`）。

### mcp

- 通过 MCP 客户端调用远端工具：
  - 根据 `serverId` 选择连接，根据 `mcpToolName ?? name` 调对应工具。
  - 支持按用户/角色 `tool_configs` 覆盖 `serverId`、`mcpToolName`、`defaultParams`、`headers`。
  - `params` 会与 `defaultParams` 合并后传入 MCP 服务器。

### skill

- 通过 Skill Runtime（HTTP）执行：
  - 运行时地址来自 `tool_configs`（endpoint/url）或环境变量 `SKILL_RUNTIME_URL`。
  - 支持 `tool_configs.secret_value` 透传为鉴权头。
  - 支持 `defaultParams` / `headers` / `authHeader` 等扩展配置。

### script

- 在**允许的脚本根目录**下执行脚本，仅允许解释器白名单：`node`、`python3`、`bash`。
- 配置：
  - 脚本根目录：环境变量 `TOOLS_SCRIPT_BASE`，默认 `项目根/scripts`。
  - 脚本路径为相对该根目录；会做规范化与“不越界”检查（realpath 在根目录下）。
- 执行时通过环境变量 `TOOL_PARAMS` 传入 JSON 参数；脚本 stdout 可返回 JSON 作为结果。

### shell

- 仅执行**命令白名单**内的命令（如 `date`、`whoami`、`pwd`、`echo`、`hostname`）。
- 命令由 `commandTemplate` 固定；可选 `paramSlots` 用 `{0}`、`{1}` 等占位，对应 schema 中的参数 key，**禁止用用户输入自由拼接命令**。
- 超时与 buffer 限制：10s、1MB。

### K8s 管理能力（当前实现）

- 当前通过 builtin `k8s-management` 暴露只读 K8s 运维能力，而非单独的 `kubectl` 工具类型。
- 默认仅允许只读子命令：`get/describe/logs/top/cluster-info/version/api-resources/api-versions/explain/diff/events`，以及 `rollout status`。
- 默认拒绝变更类动作（如 `delete/apply/patch/rollout restart`）。
- 可通过环境变量 `TOOLS_KUBECTL_ALLOWED_VERBS` 覆盖允许子命令列表，`TOOLS_KUBECTL_TIMEOUT_MS` 调整超时。

## 示例与扩展

- 示例注册见 `v1/src/services/tools/examples.ts`（mcp/skill/script/shell 各一例）。
- 按需在入口处调用 `registerAllExamples()` 或单独 `registerXxxExample()`；生产环境可只注册 builtin 与需要的 script/shell，不注册示例。
- 新增类型：在 `types.ts` 增加 kind 与接口、在 `executors/` 增加执行器并在 `executors/index.ts` 的 `runTool` 中分发。

## 当前实现差异

- `riskLevel` 与超时治理已落在 `ToolSummary` 和 `execution-policy.ts`，不再由独立 `ToolSpec` 对象统一承载。
- `mode`（`read-only` / `advice-only`）与 `auditPolicy` 仍属于设计目标，当前未进入 `types.ts` 的统一类型。

## 与 Agent 的衔接

- Plan 层可产出 `tool_call` 步骤（当前已支持时间类问题调用 `get_current_time`）。
- Act 层根据 `step.payload.toolName` / `params` 调用 `executeTool`，将结果写入 `results[].data`，answer 步骤可将工具结果格式化为 Context 再调 LLM。

## 企微入口与按人/按角色隔离

是否通过企微「提交」MCP 工具、以及工具隔离的适用性分析，见 [企微作为 MCP 工具提交入口 + 按人隔离：分析结论](TOOLS-WECOM-ENTRY-ANALYSIS.MD)。结论要点：

- **按人隔离建议做**；**企微作为自助“提交/注册”工具的主入口当前不建议**，可先做按人/按角色过滤与配置侧管理，企微仅作使用入口或只读「我的工具」。
- **推荐模型**：**管理端 UI** 作为工具配置入口；工具按 **角色** 隔离（「这个角色下的工具」）。用户通过 token/userId 识别 → 解析其角色 → 只列出/只允许该角色下的工具，避免「每人不同 token 却共用同一套工具」。详见分析文档第 7 节。

## 工具配置与密钥

**场景**：工具能力可外部提供（MCP/脚本/技能），但不同用户可能拥有不同密钥或配置。

**设计要点**：
- 工具本体仍由代码注册（工具目录），权限通过 `role_tools` 管理。
- 用户级配置存数据库，支持不同用户绑定不同密钥。
- 密钥目前以明文存放在数据库，后续可替换为 `secret_ref` 对接密钥管理服务。

**表结构**：`tool_configs`
- `owner_type`：`user` / `role` / `tenant`
- `owner_id`：用户/角色/租户 ID
- `tool_name`：工具名称
- `config`：工具配置（JSON）
- `secret_value`：密钥（明文，后续可替换）

**解析顺序**：
1. 用户级配置（`owner_type = user`）
2. 角色级配置（`owner_type = role`）
3. 无配置则使用默认行为

**API/MCP 安全入口**
- API/MCP 访问必须携带用户令牌（`Authorization: Bearer <token>`）。
- 令牌在管理端创建并绑定企微用户。
- 令牌支持过期与吊销。
- 首次初始化可通过数据库写入 `user_tokens` 完成引导。

## 参考文件

- `v1/src/services/tools/types.ts` — 类型
- `v1/src/services/tools/registry.ts` — 注册与执行入口
- `v1/src/services/tools/executors/` — 各 kind 执行器
- `v1/src/services/tools/builtin.ts` — 内置工具
- `v1/src/services/tools/examples.ts` — 示例注册
