# MCP 执行器说明

> 当前文档以 **已运行服务的管理端 API** 为准。若你在本地联调，默认示例地址使用 `http://127.0.0.1:3001`；若是线上环境，请替换为实际域名或端口转发地址。

## 典型流程

### 1. 配置 MCP Server

```bash
curl -X POST http://127.0.0.1:3001/api/mcp/servers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "sre-copilot",
    "config": {
      "url": "http://127.0.0.1:3001",
      "transport": "http",
      "timeout": 30000
    }
  }'
```

### 2. 立即重载配置

```bash
curl -X POST http://127.0.0.1:3001/api/mcp/servers/reload \
  -H "Authorization: Bearer <token>"
```

### 3. 手动调用工具

```bash
curl -X POST http://127.0.0.1:3001/api/mcp/servers/sre-copilot/tools/search/call \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "params": {
      "query": "test",
      "limit": 3
    }
  }'
```

## 测试

### 运行测试脚本

```bash
cd <PROJECT_ROOT>
AUTH_TOKEN=<token> bash scripts/test/test-mcp-executor.sh http://127.0.0.1:3001
```

### 手动检查

```bash
curl http://127.0.0.1:3001/api/mcp/servers \
  -H "Authorization: Bearer <token>"

curl http://127.0.0.1:3001/api/mcp/servers/sre-copilot/test \
  -H "Authorization: Bearer <token>"

curl http://127.0.0.1:3001/api/mcp/servers/sre-copilot/tools \
  -H "Authorization: Bearer <token>"

curl http://127.0.0.1:3001/api/tools \
  -H "Authorization: Bearer <token>" | jq '.data.tools[] | select(.kind == "mcp")'
```

## 故障排查

### 连接超时

先确认目标服务可达：

```bash
curl http://127.0.0.1:3001/api/mcp/servers/sre-copilot/test \
  -H "Authorization: Bearer <token>"
```

### 配置错误

检查：

- `mcp-config.json`
- 管理端数据库中的 MCP server 配置
- 运行中的服务地址是否与 `3001` / 实际域名一致

---

如果当前仓库里没有运行中的 HTTP 服务，请先准备外部服务实例或使用远端已部署环境，再执行这些接口调用。
