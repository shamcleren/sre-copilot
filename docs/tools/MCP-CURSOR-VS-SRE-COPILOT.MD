# Cursor 本地 MCP 与 sre-copilot 调用监控 MCP 的差异对比

> ⚠️ 文中若引用 `v1/src/`，均属于历史实现路径。当前仓库已删除 `v1/`，现行实现请以 `v2/` 与当前运行时脚本为准。

## 目的

当 Cursor 本地调用监控 MCP（如 `execute_range_query`）返回 **200**，而 sre-copilot 对话/前端调用同能力返回 **403** 时，按本表逐项对比，便于对齐配置与请求形态。

---

## 1. 请求方式与 URL / Body

| 项目 | Cursor 本地 MCP | sre-copilot |
|------|-----------------|---------------|
| **协议形态** | 一般为 **单端点 + JSON-RPC**（与 MCP 标准一致） | 取决于 MCP 服务器配置的 `transport` |
| **transport = `http`（默认）** | — | POST 到 `{baseUrl}/tools/{toolName}`<br>例如 `https://.../mcp/tools/execute_range_query`<br>Body：**纯 JSON 对象**（即 params，无 jsonrpc 包装） |
| **transport = `streamable-http`** | — | POST 到 **server.url**（与 listTools 同址）<br>Body：**JSON-RPC 2.0**<br>`{ "jsonrpc":"2.0", "id":"...", "method":"tools/call", "params":{ "name":"execute_range_query", "arguments":{ ... } } }` |
| **蓝鲸网关常见期望** | 单端点 + JSON-RPC，带网关认证头 | 若网关只认 JSON-RPC，则 sre-copilot 须使用 **streamable-http**，否则易 403/404 |

**结论**：若 Cursor 能 200，说明网关接受「单端点 + JSON-RPC」。sre-copilot 侧应把该监控 MCP 的 **transport 设为 `streamable-http`**，与 Cursor 行为一致。

---

## 2. 认证与 Headers 来源

| 项目 | Cursor 本地 MCP | sre-copilot |
|------|-----------------|---------------|
| **配置来源** | Cursor 的 MCP 配置（如 `~/.cursor/mcp.json` 或项目内配置） | 数据库表 **mcp_servers** + 可选 **tool_configs**（用户/角色级） |
| **URL** | 配置中的 `url`（通常为网关 MCP 入口） | `mcp_servers.url` |
| **apiKey** | 配置中的 secret/env | `mcp_servers.api_key` → 请求头 **X-API-Key** |
| **其他 Headers** | 配置中的 headers（如 `X-Bkapi-Authorization` 等） | `mcp_servers.raw_config.headers` 或 **tool_configs.config.headers**，合并进每次请求 |
| **context 注入** | 一般无 | 若存在：`X-User-Id`、`X-Session-Id`、`X-Role-Ids`、`Authorization: Bearer <token>`（来自 tool_config） |

**从 Cursor 配置可知：API Key 并非必填**。本机 `~/.cursor/mcp.json` 中 `bkmonitorv3-prod-metrics-query` 仅配置了 `url`、`transportType`、`headers`（含 `X-Bkapi-Authorization`），**未配置** `api_key`。即监控 MCP 的认证完全依赖 headers，无需 X-API-Key。

**结论**：403 多为「网关不认当前请求身份」。需保证 sre-copilot 里该 MCP 的 **url、headers** 与 Cursor 一致；**API Key 可留空**，与 Cursor 行为一致。

---

## 3. 参数（params）形态

| 项目 | Cursor 本地 MCP | sre-copilot |
|------|-----------------|---------------|
| **来源** | 由 Cursor/工具描述决定，通常为扁平或 body_param 包装 | **tool_config.defaultParams** 与 **Plan 传入的 params** 合并，**原样透传**，不做结构重塑 |
| **示例** | 如 `body_param: { bk_biz_id, promql, start_time, end_time, step }` 或扁平 | `mergedParams = { ...defaultParams, ...params }`，直接作为 `arguments` 或 POST body |
| **bk_biz_id** | 由 Cursor 侧配置或调用方传入 | 来自 defaultParams 或用户/对话传入；若传了且开启 biz 白名单，会做 **getUserAllowedBusinessIds** 校验 |

**结论**：参数形态一致即可；Cursor 能 200 说明网关认当前参数格式。sre-copilot 只需保证 **bk_biz_id** 等与 Cursor 一致，且不因 biz 白名单误拦。

---

## 4. 建议排查顺序

1. **将监控 MCP 的 transport 改为 `streamable-http`**  
   在管理后台编辑该 MCP 服务器，transport 选 **streamable-http**，保存并重载，使请求与 Cursor 一样走「单端点 + JSON-RPC」。

2. **对齐 URL**  
   sre-copilot 的 `mcp_servers.url` 与 Cursor 里该 MCP 的 `url` 一致（一般为网关 MCP 入口，带 trailing slash 与否按网关要求）。

3. **对齐认证**  
   - 以 Cursor 为准：Cursor **未配置 api_key** 时，sre-copilot 的 **API Key 留空**即可；认证仅靠 **raw_config.headers**（如 `X-Bkapi-Authorization`）与 Cursor 一致。  
   - 敏感字段需配置 **MCP_SECRET_KEY** 后写入，避免明文落库。

4. **确认 403 是否来自 sre-copilot 自身**  
   若开启了业务 ID 白名单，且请求中的 bk_biz_id 不在白名单，会先被 sre-copilot 拦截并返回错误（非上游 403）。此时需在「用户/业务权限」中放开该 biz_id，或调整 defaultParams。

5. **看日志**  
   请求时查看 sre-copilot 日志中的 `MCP 调用头部确认(脱敏)`、`finalParamKeys`，确认 URL、transport、headers、params 与 Cursor 实际请求一致。

---

## 5. 代码位置速查

| 行为 | 文件与位置 |
|------|------------|
| transport 判断与 callTool 分支 | `v1/src/services/mcp-client.ts`（`useStreamableHttp`、POST url vs callRpc） |
| streamable-http 下 JSON-RPC body | `v1/src/services/mcp-client.ts` 的 `callRpc` |
| 合并 defaultParams + params 透传 | `v1/src/services/tools/executors/mcp.ts` 的 `runMcp` |
| MCP 服务器配置加载（url/api_key/headers/transport） | `v1/src/services/mcp-client.ts` 的 `loadMcpServersToClient`、`mcp-config-manager.ts` |
| 用户级 headers（tool_config） | `v1/src/services/tools/executors/mcp.ts` 的 `resolvedConfig.config.headers` 传入 `context.headers` |

---

## 6. 本机 Cursor 配置与 sre-copilot 应对齐项（实测）

以下为读取 **本机 Cursor 配置**（`~/.cursor/mcp.json`）中监控 MCP 的实测值。环境一致时，差异仅在配置；按下列项在 sre-copilot 管理后台或 DB 中对齐即可。

### 6.1 Cursor 本地（bkmonitorv3-prod-metrics-query）

| 配置项 | 本机取值 |
|--------|----------|
| **id** | `bkmonitorv3-prod-metrics-query` |
| **url** | `https://mcp.example.com/bkmonitorv3-prod-metrics-query/mcp/` |
| **transportType** | `streamable-http` |
| **headers** | `X-Bkapi-Authorization`: `{"access_token":"<你的 access_token>"}`（JSON 字符串） |

说明：Cursor 未对该 MCP 配置 `api_key`，认证完全依赖 **headers.X-Bkapi-Authorization**。

### 6.2 sre-copilot 侧应对齐的配置

在 **管理后台 → MCP 服务器** 中，编辑或新增 id 为 `bkmonitorv3-prod-metrics-query` 的服务器，保证：

| 字段 | 取值（与 Cursor 一致） |
|------|------------------------|
| **URL** | `https://mcp.example.com/bkmonitorv3-prod-metrics-query/mcp/` |
| **Transport** | `streamable-http`（必选，否则请求形态与 Cursor 不同，易 403） |
| **API Key** | 留空（Cursor 未用 X-API-Key） |
| **raw_config（或「高级 / 自定义配置」）** | 需包含 `headers`，且与 Cursor 一致，例如：<br>`{ "headers": { "X-Bkapi-Authorization": "{\"access_token\":\"<与 Cursor 相同的 access_token>\"}" } }` |

若管理后台以 JSON 编辑 **raw_config**，可写成：

```json
{
  "headers": {
    "X-Bkapi-Authorization": "{\"access_token\":\"<与 ~/.cursor/mcp.json 中相同的 access_token>\"}"
  }
}
```

保存后执行「重载 MCP 配置」或重启服务，使 `loadMcpServersToClient` 重新从 DB 加载。之后请求形态与认证头与 Cursor 一致，403 若仍出现则多为网关侧权限（业务/应用授权），而非配置不一致。

### 6.3 管理后台 MCP 表单与 Cursor 的对应关系

管理后台（**MCP 服务器** 注册/编辑）中：

- **服务名称、服务地址、传输类型** 为必填（带红色 \*）；**API Key** 无必填标记，placeholder 为「留空则不传，敏感值会加密存储」——与 Cursor 上 API Key 非必填一致，监控 MCP 留空即可。
- **自定义 Headers（JSON）** 对应 Cursor 的 `headers`，需在此或 raw_config 中配置 `X-Bkapi-Authorization`，与 Cursor 保持一致。

---

## 7. sre-copilot 业务 ID 权限校验（与 Cursor 的差异）

sre-copilot **在调用 MCP 前** 会做业务 ID 白名单校验；Cursor 无此逻辑。若你已在管理后台配置了该能力，需注意以下行为，便于区分「本系统拦截」与「上游 403」。

### 7.1 配置入口

- **管理后台 → 用户管理 → 对应用户 → 业务 ID 配置**
- 可配置：**默认业务 ID**（MCP 调用时未指定则注入）、**允许的业务 ID（白名单）**
- 说明文案：「为空表示不限制；配置后用户只能查询白名单内的业务数据」

### 7.2 校验逻辑（代码依据）

- 实现位置：`v1/src/services/tools/executors/mcp.ts` 的 `runMcp`。
- 从合并后的 params 中解析 biz_id（支持 `bk_biz_id`、`bkBizId`、`body_param.bk_biz_id` 等，见 `BIZ_KEYS`）。
- 若存在 `context.userId` 且解析到 `usedBizId`，则调用 `getUserAllowedBusinessIds(userId)` 获取该用户允许的业务 ID 列表（来自 `user.metadata.allowedBusinessIds`）。
- **当允许列表非空且 `usedBizId` 不在列表中**：直接返回错误，**不请求上游 MCP**：
  - `success: false`
  - `error`: `业务 ID ${usedBizId} 不在您的授权范围内（允许：${allowed.join(', ')}）`
  - `auditMeta.blocked: true`，`reason: 'biz_id_not_allowed'`

### 7.3 判定方式

- 若用户看到的错误文案是 **「业务 ID xxx 不在您的授权范围内」**，则为 **sre-copilot 本系统拦截**（业务 ID 白名单），不是网关 403。处理方式：在管理后台为该用户增加该业务 ID 到「允许的业务 ID」，或清空白名单（不限制）。
- 若错误为上游返回的 HTTP 403 / 权限不足，则请求已发出，属网关或蓝鲸侧权限问题。**需确认当前 app_code 是否有该业务空间的数据查询权限**（app_code 由 MCP 配置的 X-Bkapi-Authorization 对应应用决定）。具体排查步骤与示例（含反馈编号、Request ID、接口地址）见 [MCP-EXECUTOR.MD § 监控类 MCP 返回 403](MCP-EXECUTOR.MD#%E7%9B%91%E6%8E%A7%E7%B1%BB-mcp-%E8%BF%94%E5%9B%9E-403-%E6%9D%83%E9%99%90%E4%B8%8D%E8%B6%B3%E6%97%B6)。

---

**版本**: 1.0  
**更新时间**: 2026-03
