# “我的工具”命令说明

> 本文描述企微/对话入口中的“我的工具”能力。所有 HTTP 示例默认使用 `http://127.0.0.1:3001`；如在远端环境使用，请替换为实际服务地址。

## 手动测试

```bash
cd <PROJECT_ROOT>

# 如需调用受保护接口，请先准备 AUTH_TOKEN
# 然后在企微或对话入口发送：“我的工具”
```

## 常见问题

### 1. 无法识别用户身份

重点检查回调里是否正确解析 `FromUserName`，以及身份映射是否完成。

### 2. 没有分配角色

```bash
curl -X POST http://127.0.0.1:3001/api/admin/users/<userid>/roles \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"roleId":"default"}'
```

### 3. 角色没有任何工具

```bash
curl -X POST http://127.0.0.1:3001/api/admin/roles/<roleid>/tools \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"toolName":"get_current_time"}'
```

### 4. 查询失败

```bash
curl http://127.0.0.1:3001/health
```

同时建议查看应用日志中与数据库、角色解析、工具可见性相关的输出。

## 当前建议

- 角色/工具分配优先通过管理端 API 完成
- 本地端口示例统一使用 `3001`
- 若当前仓库没有运行中的 HTTP 服务，请改为在远端已部署环境验证
