# MCP 与 Skills 工具清单（执行版）

> 目标：提升研发效率、验收质量和可追溯性。
> 原则：先装高价值工具，再做功能开发。

## 1. 推荐安装顺序

### 1.1 第一批（立即）

- Playwright MCP（浏览器自动化验收）
- GitHub MCP（PR/Issue/Actions 自动化）
- PostgreSQL MCP（只读查库与配置验收）
- Excalidraw MCP（架构图与流程图）

### 1.2 第二批（按需）

- Figma MCP（设计上下文到前端实现）
- 其他来自 awesome-mcp-servers 的专项 MCP

## 2. 与迭代目标映射

- Iteration 1（ChatOps 管理入口）：
  - PostgreSQL MCP：验证“安全配置入库与加密状态”。
  - GitHub MCP：自动串联缺陷跟踪与修复流。
  - Excalidraw MCP：绘制权限策略与执行流程图。

- Iteration 2（连续对话能力）：
  - Playwright MCP：跑多轮会话场景，验证上下文连续性。
  - PostgreSQL MCP：核对会话与记忆数据是否按预期落库。

- Iteration 3（全链路验收）：
  - Playwright MCP + GitHub MCP + PostgreSQL MCP 组合验收。
  - 企微入口接入后复用同一套场景脚本与报告模板。

## 3. 已具备的本地 Skills（可直接用）

- `frontend-design`：前端页面设计与高质量实现。
- `webapp-testing`：本地页面交互测试与验证。
- `mcp-builder`：自建/改造 MCP 服务。
- `doc-coauthoring`：结构化文档共创与校对。
- `web-artifacts-builder`：复杂前端原型搭建。

## 4. 采用建议

- 先做工具链基线（Iteration 0），再推进业务功能。
- 密钥与 token 只走环境变量或加密存储，不写死到仓库配置。
- 工具接入后，先产出一个最小可用验收用例，再扩展覆盖范围。

## 5. 维护策略

- 每周一次工具可用性巡检（版本、鉴权、超时）。
- 每个工具至少绑定一个真实验收场景，避免“装了不用”。
- 新增 MCP 后同步更新 `docs/DOCS-INDEX.MD` 与 `CHANGELOG.MD`。
