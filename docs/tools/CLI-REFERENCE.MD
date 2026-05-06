# CLI 参考（历史归档）

> `srectl` CLI 对应的 `v1/bin/srectl.js` 已随 `v1/` 目录删除，不再是当前仓库内可直接执行的入口。
>
> 本文保留为**历史能力说明**，用于理解过去的交互方式；当前请优先使用：
>
> - `README.MD` 中的 `runtime:*` / `v2:*` 命令
> - `Makefile` 中的 `verify-*` / `deploy-*` / `runtime-*` 入口
> - 远端已部署服务的 HTTP API

## 当前替代入口

### 运行时与状态

```bash
npm run workflow:resume
npm run workflow:verify
npm run workflow:refresh
npm run workflow:handoff
npm run runtime:compare
```

### Makefile

```bash
make verify-v2-core
make runtime-readiness-status
make runtime-handoff
make deploy-fast
```

### HTTP API（外部服务示例）

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:3001/api
curl http://127.0.0.1:3001/health
curl -X POST http://127.0.0.1:3001/api/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"系统健康状态","strategy":"AUTO"}'
```

## 说明

如果未来重新引入独立 CLI，请以新的仓库入口和实现为准；不要再根据旧的 `v1/bin/srectl.js` 路径恢复本地执行流程。
