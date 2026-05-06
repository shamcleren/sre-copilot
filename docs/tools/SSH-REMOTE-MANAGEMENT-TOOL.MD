# SSH 远程管理工具（项目接入版）

> ⚠️ 文中若引用 `v1/src/`，均属于历史实现路径。当前仓库已删除 `v1/`，现行实现请以 `v2/` 与当前工具注册/运行时实现为准。

## 目标

在 SRE Copilot 工具系统中接入 `ssh_remote_management`，并将主机连接信息存储在数据库（`tool_configs`），避免依赖本地 JSON 文件。

安全策略：

- 高风险动作默认 `advice-only`
- 只有显式确认才执行

## 工具信息

- 工具名：`ssh_remote_management`
- 类型：`builtin`
- 历史注册位置：`v1/src/services/tools/builtin.ts`（当前仅作历史参考，不再是可用源码路径）

## 支持动作

- `list`
- `show`
- `test`
- `connect`
- `exec`
- `upload`
- `download`

## 参数

- `action`：动作名（必填）
- `host`：主机别名（`show/test/connect/exec/upload/download` 必填）
- `command`：远程命令（`exec` 必填）
- `localPath`：本地路径（`upload/download` 必填）
- `remotePath`：远程路径（`upload/download` 必填）
- `mode`：`advice-only | execute`，默认 `advice-only`
- `confirmExecute`：高风险动作执行确认，需为 `true`

## 风险控制

- 高风险动作：`exec/upload/download`
- 默认行为：仅返回建议命令，不执行
- 执行条件：
  - `mode=execute`
  - `confirmExecute=true`
## 配置存储（数据库）

通过现有管理接口写入：

- `POST /api/admin/users/:userId/tools/ssh_remote_management/config`

配置示例：

```json
{
  "config": {
    "hosts": [
      {
        "alias": "dev",
        "hostname": "9.134.9.112",
        "user": "root",
        "port": 36000,
        "keyPath": "/root/.ssh/id_rsa"
      }
    ]
  },
  "secretValue": "{\"passwords\":{\"dev\":\"your-password-if-needed\"}}"
}
```

## 角色权限

已纳入默认角色工具补齐逻辑（`seedDefaultRolesAndTools`）：

- `default` / `developer` / `admin` 均可见该工具

如果你希望只对 `admin` 开放，可在 `role_tools` 中调整绑定策略。
