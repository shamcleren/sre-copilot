# 企微 Bot 使用指南

> 当前仓库中的企微接入说明以 **远端已部署服务 + 配置检查 + 回调排障** 为主；不再提供 `v1/` 本地开发入口或 `npm run dev` 型 Bot 启动方式。

## 当前形态

企微 Bot 的现行使用方式是：

1. 在项目根目录准备 `.env.secrets`
2. 通过 `make deploy-fast` 或 `scripts/deploy/deploy-remote.sh` 部署到远端集群
3. 通过 `/wechat/config-check`、`/wechat/callback` 与 Pod 日志验证配置与回调

## 必需配置

建议在项目根目录维护 `.env.secrets`：

```bash
WECOM_CORP_ID=your_corp_id
WECOM_AGENT_ID=your_agent_id
WECOM_SECRET=your_secret
WECOM_TOKEN=your_token
WECOM_ENCODING_AES_KEY=your_aes_key
WECOM_WEBHOOK_URL=your_webhook_url
```

其中：

- `WECOM_TOKEN` / `WECOM_ENCODING_AES_KEY`：**接收消息必填**
- `WECOM_CORP_ID` / `WECOM_AGENT_ID` / `WECOM_SECRET`：**自建应用主动发消息必填**
- `WECOM_WEBHOOK_URL`：**群机器人回退发送通道**

## 部署

```bash
make deploy-fast
```

部署脚本会把本地 `.env.secrets` 上传为远端 `secrets.env`，再 merge 到 `sre-copilot-secret`。

## 配置检查

部署后先做：

```bash
curl -s https://你的域名/wechat/config-check
```

如果返回中任一关键项为 `false`，通常会导致：

- `WECOM_TOKEN` / `WECOM_ENCODING_AES_KEY` 缺失：URL 验证失败、消息验签失败
- `WECOM_CORP_ID` / `WECOM_AGENT_ID` / `WECOM_SECRET` 缺失：能收消息但异步主动回复失败

## 回调测试

### 健康检查

```bash
curl http://127.0.0.1:3001/health
```

### URL 验证

```bash
curl "http://127.0.0.1:3001/wechat/callback?msg_signature=test&timestamp=1234567890&nonce=test&echostr=hello"
```

> 上面是本地/端口转发示例；线上请替换为你的域名。

## 排障建议

### 1. 收不到消息

优先检查：

- 企微后台的回调 URL 是否与实际公网地址一致
- `WECOM_TOKEN` / `WECOM_ENCODING_AES_KEY` 是否完全匹配
- 外网访问 `GET /wechat/callback` 是否至少能返回 `400` 而不是超时/`5xx`

查看日志：

```bash
ssh dev 'kubectl logs -f deployment/sre-copilot-app -n sre-copilot'
```

重点关注关键词：

- `企微回调验证`
- `签名验证失败`
- `echostr 解密失败`
- `解析消息成功`

### 2. 能收到消息但没有回复

优先确认日志走到了哪一步：

- `已从 body 提取 Encrypt`
- `加密消息签名验证通过`
- `被动回复(加密)已返回`
- `无回复内容，返回 success`

### 3. 只收到“正在思考...”，没有第二条 AI 回复

第二条消息走企微主动发送能力，依赖：

- `WECOM_CORP_ID`
- `WECOM_AGENT_ID`
- `WECOM_SECRET`

可继续检查：

```bash
ssh dev 'kubectl logs deployment/sre-copilot-app -n sre-copilot | grep -i "企微发送应用消息失败\|异步 LLM 回复失败"'
```

### 4. 群里 @ 机器人没收到最终回复

确认：

- 是否拿到了正确的 `chatId`
- 是否配置了 `WECOM_WEBHOOK_URL`
- Webhook 绑定的群是否就是当前群

重点日志：

- `异步回复已通过 appchat/send 发到群`
- `异步回复已通过 Webhook 发到配置的群`
- `Webhook 发送失败`

## 当前推荐入口

- **部署**：`make deploy-fast`
- **配置检查**：`/wechat/config-check`
- **回调验证**：`/wechat/callback`
- **日志排查**：`kubectl logs deployment/sre-copilot-app -n sre-copilot`

---

如需仓库整体入口，请回到 `README.MD`；如需部署细节，请看 `DEPLOYMENT-GUIDE.MD`。
