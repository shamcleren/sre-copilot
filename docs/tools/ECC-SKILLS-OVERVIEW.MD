# Everything-Claude-Code Skills 中文总览

> 适用范围：当前环境已安装到 `~/.codex/skills/` 的 ECC Skills。
> 目的：用中文快速了解“有什么、干什么、先用哪些”。

## 1. 这份清单怎么用

- 按“场景”而不是按技能名选工具：先看分类，再挑 1~2 个技能组合使用。
- 优先使用与你当前任务直接相关的技能，避免一次触发过多能力。
- 新会话优先启用“检索 + 实施 + 验证”三段式组合，提高稳定性。

## 2. 技能分类总览（中文）

### 2.1 工程流程与质量

- `search-first`：先检索再编码，避免重复造轮子。
- `tdd-workflow`：测试先行，覆盖新增/修复/重构流程。
- `verification-loop`：交付前执行系统化验证闭环。
- `eval-harness`：构建更正式的评测框架与验收标准。
- `skill-stocktake`：盘点并评估技能质量。

### 2.2 后端与 API

- `backend-patterns`：Node/Express/Next API 常见架构与实现模式。
- `api-design`：REST API 设计规范（资源、分页、错误码、版本）。
- `deployment-patterns`：部署、回滚、健康检查、发布准备清单。
- `database-migrations`：数据库迁移与零停机变更策略。

### 2.3 数据库与数据侧

- `postgres-patterns`：PostgreSQL 索引、查询优化、Schema 设计。
- `jpa-patterns`：JPA/Hibernate 实体关系与性能模式（Java）。
- `clickhouse-io`：ClickHouse 分析型查询与数据工程实践。
- `content-hash-cache-pattern`：基于内容哈希的缓存策略。

### 2.4 安全与风险控制

- `security-review`：研发过程中的通用安全检查。
- `security-scan`：扫描 Claude/Codex 配置中的安全风险。
- `docker-patterns`：容器网络、卷、镜像与安全实践。
- `cost-aware-llm-pipeline`：LLM 成本控制与模型路由策略。

### 2.5 前端与体验

- `frontend-patterns`：React/Next 前端工程模式与性能优化。
- `e2e-testing`：Playwright E2E 测试模式与抗脆弱实践。
- `frontend-design`：高质量界面实现（视觉+工程）。

### 2.6 语言/框架专项

- Python：`python-patterns`、`python-testing`
- Django：`django-patterns`、`django-security`、`django-tdd`、`django-verification`
- Go：`golang-patterns`、`golang-testing`
- Java/Spring：`java-coding-standards`、`springboot-patterns`、`springboot-security`、`springboot-tdd`、`springboot-verification`
- C++：`cpp-coding-standards`、`cpp-testing`
- Swift/iOS：`swiftui-patterns`、`swift-concurrency-6-2`、`swift-actor-persistence` 等

### 2.7 文档与办公产物

- `doc-coauthoring`：结构化文档共创。
- `docx` / `pdf` / `pptx` / `xlsx`：对应文档格式处理专项能力。
- `internal-comms`：内部沟通稿（进展、公告、汇报）写作支持。

## 3. 结合本项目的优先推荐（前 12）

> 针对当前仓库（Node.js + 工具治理 + 验证导向）建议优先使用：

1. `search-first`
2. `backend-patterns`
3. `api-design`
4. `postgres-patterns`
5. `security-review`
6. `security-scan`
7. `deployment-patterns`
8. `database-migrations`
9. `docker-patterns`
10. `tdd-workflow`
11. `e2e-testing`
12. `verification-loop`

## 4. 三套常用组合

- 需求开发：`search-first` + `backend-patterns` + `api-design`
- 上线前校验：`tdd-workflow` + `e2e-testing` + `verification-loop`
- 风险收敛：`security-review` + `security-scan` + `deployment-patterns`

## 5. 使用建议（避免“全开失焦”）

- 同一轮任务建议聚焦 1~3 个技能，不建议全量混用。
- 涉及生产变更时，优先走“验证闭环”后再执行上线动作。
- 若感觉上下文变重，可改为“先检索、后实现、再验证”的串行方式。

## 6. 参考来源

- ECC 项目主页：`https://github.com/affaan-m/everything-claude-code`
- 本机技能目录：`~/.codex/skills/`
