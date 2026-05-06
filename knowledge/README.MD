# SRE Copilot 知识库

> 四维隔离的混合知识库：模拟人类专家的知识组织方式

## 🎯 设计理念

### 领域专家模式
就像一个真实的领域专家：
- 📚 在特定领域有**深度知识**（领域隔离）
- 💬 单次会话**上下文收敛**（会话隔离）
- 🔐 不同身份有**不同权限**（角色隔离）
- 👁️ 知识有**可见性层级**（可见性隔离）

---

## 🏗️ 四维隔离架构

### 1️⃣ 角色隔离 (Role Isolation)
```
admin     → 系统管理、运维、安全配置
developer → 开发调试、代码审查、API 设计
default   → 基础使用、常见问题
```

**示例**：
- admin 可见：部署指南、Secret 管理、K8s 运维
- developer 可见：开发指南、调试技巧、代码规范
- default 可见：用户手册、常见问题

### 2️⃣ 会话隔离 (Session Isolation)
```
会话 A: "K8s 部署问题"
  → 检索优先本会话的知识
  → 避免混入其他会话内容

会话 B: "企微 Bot 开发"
  → 独立的上下文
  → 不会检索到会话 A 的内容
```

**示例**：
- 会话中提到的 Secret 问题 → 下次询问优先返回本会话的解决方案
- 不同会话的知识互不干扰，避免上下文污染

### 3️⃣ 领域隔离 (Domain Isolation)
```
k8s         → K8s 部署、Secret、Ingress
nodejs      → TypeScript、Fastify、性能
wecom       → 企微 API、Bot、消息处理
monitoring  → BkMonitor、告警、指标
```

**示例**：
- 询问"部署问题" + domain='k8s' → 返回 K8s 部署知识
- 询问"部署问题" + domain='nodejs' → 返回 Node.js 部署知识

### 4️⃣ 可见性隔离 (Visibility Isolation)
```
public   → 所有人可见（文档、FAQ）
role     → 特定角色可见（专业知识）
private  → 仅创建者可见（个人笔记）
```

---

## 📁 目录结构

```
knowledge/
├── public/              # 公开知识（所有角色）
│   ├── docs/            # 技术文档
│   └── faqs/            # 常见问题
│
├── roles/               # 按角色隔离
│   ├── admin/           # 管理员专属
│   ├── developer/       # 开发者专属
│   └── default/         # 默认用户
│
├── domains/             # 按领域分类
│   ├── k8s/             # K8s 领域
│   ├── nodejs/          # Node.js 领域
│   ├── wecom/           # 企微领域
│   └── monitoring/      # 监控领域
│
├── sessions/            # 会话专属（自动生成）
│   └── {sessionId}/
│
└── .meta/               # 元数据（不提交）
    ├── index-state.json
    └── embeddings-cache/
```

---

## 💾 混合存储方案

### PostgreSQL (向量检索)
- **memories 表**：存储知识块和向量
- **四维隔离字段**：role_id, session_id, domain, visibility
- **检索优化**：向量索引 + 全文索引 + 标签索引

### 文件系统 (原始文档)
- **Markdown 文档**：便于编辑和版本控制
- **目录隔离**：按角色和领域分类
- **Git 管理**：追踪文档变更历史

---

## 🔍 检索算法

### 多维得分计算

```
最终得分 = 
  40% × 语义相似度 (embedding cosine / 关键词匹配)
+ 20% × 角色匹配度 (role_id 精确匹配)
+ 20% × 会话相关性 (session_id / user_id)
+ 10% × 领域匹配度 (domain 匹配)
+ 5%  × 时间衰减 (exp decay)
+ 5%  × 热度权重 (access_count)
```

### 权限过滤规则

```sql
WHERE 
  deleted_at IS NULL
  AND (
    visibility = 'public'           -- 公开知识
    OR role_id IN (用户角色列表)    -- 角色匹配
    OR role_id IS NULL              -- 全局知识
    OR user_id = 当前用户           -- 自己创建的
  )
```

---

## 📝 文档编写规范

### Markdown 文档头部（YAML Front Matter）

```markdown
---
title: K8s Secret 管理指南
domain: k8s
role: admin
visibility: role
tags: [k8s, secret, security, deployment]
author: shamcleren
created: 2026-02-07
updated: 2026-02-07
---

# K8s Secret 管理指南

## 问题背景
...
```

### 文件命名规范
```
{DOMAIN}-{TOPIC}-{TYPE}.MD

示例:
- K8S-SECRET-MANAGEMENT-GUIDE.MD
- NODEJS-PERFORMANCE-OPTIMIZATION.MD
- WECOM-BOT-DEVELOPMENT-TUTORIAL.MD
```

---

## 🔧 使用方法

### 1. 添加知识文档

```bash
# 创建新文档
cd knowledge/domains/k8s
vim SECRET-MANAGEMENT.MD

# 索引到数据库（自动/手动）
node scripts/index-knowledge.js
```

### 2. 通过 Agent 检索

```typescript
// 在 Agent 中自动检索
const results = await searchKnowledge("如何管理 Secret", {
  userId: "shamcleren",
  roleIds: ["admin"],
  sessionId: "conv_20260207_001",
  domain: "k8s"
});

// 返回按得分排序的知识
// - 同会话中的 Secret 讨论
// - 用户其他 K8s 会话的经验
// - admin 角色的 Secret 管理文档
// - 公开的 K8s 知识
```

### 3. 查看访问统计

```bash
# 查询热门知识
SELECT content, access_count, quality_score
FROM memories
WHERE domain = 'k8s'
ORDER BY access_count DESC
LIMIT 10;
```

---

## 🧪 测试覆盖

- ✅ 角色隔离测试
- ✅ 会话隔离测试
- ✅ 领域隔离测试
- ✅ 可见性隔离测试
- ✅ 综合检索排序测试
- ✅ 权限验证测试

**测试文件**：`src/services/knowledge/__tests__/manager.test.ts`

---

## 📊 统计信息

| 指标 | 值 |
|------|---|
| 数据库表 | 3 个 (memories, session_contexts, knowledge_access_log) |
| 索引数量 | 15+ |
| 隔离维度 | 4 维 |
| 排序因子 | 6 个 |
| 测试用例 | 10+ |

---

## 📚 相关文档

- 技术设计：`../docs/design/TECHNICAL-DESIGN.MD`
- 文档索引：`../docs/DOCS-INDEX.MD`
- Secret 管理：`../docs/security/SECRET-MANAGEMENT.MD`

---

**版本**：v2.0.0-alpha  
**最后更新**：2026-02-07  
**维护者**：shamcleren
