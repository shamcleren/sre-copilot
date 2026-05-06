# 双系统理论（Dual-Process Theory）完整设计文档

> **基于认知科学的 Agent 架构升级**  
> **版本**: v2.0  
> **状态**: 设计阶段  
> **日期**: 2026-02-07

---

## 🎯 设计目标

将 SRE Copilot 从"单一推理模式"升级为"双系统自适应架构"：
- **系统1（快思考）**：简单任务快速响应，减少延迟和成本
- **系统2（慢思考）**：复杂任务深度推理，保证质量和准确性

**核心原则**：
- ✅ LLM 始终参与（做意图识别和上下文理解）
- ✅ 根据任务复杂度动态选择"结果生成"方式
- ✅ 自动兜底（识别失败自动降级到系统2）

---

## 📐 架构设计

### 整体流程

```
┌─────────────────────────────────────────────────────────────┐
│                        用户输入                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  1. 上下文准备（Context Preparation）                       │
│     - 检索会话上下文 (session_contexts)                     │
│     - 检索相关知识 (search_knowledge, top 3)               │
│     - 构建上下文摘要                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. 意图识别（Intent Recognition - 轻量 LLM）               │
│     Input: 用户输入 + 上下文                                │
│     Output: {                                               │
│       intent: string,        // 意图类型                    │
│       complexity: string,    // 复杂度等级                  │
│       tools: string[],       // 所需工具                    │
│       params: object,        // 工具参数                    │
│       confidence: number     // 识别置信度                  │
│     }                                                        │
│     Cost: ~50 tokens (轻量调用)                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 路由决策（Routing Decision）                            │
│                                                              │
│     if (complexity === 'trivial' && confidence > 0.8):      │
│         → 系统1 快速通道                                     │
│     else:                                                    │
│         → 系统2 深度推理                                     │
└─────────────────────────────────────────────────────────────┘
          ↓                                    ↓
┌──────────────────────┐          ┌──────────────────────────┐
│  系统1（快速通道）    │          │  系统2（深度推理）        │
├──────────────────────┤          ├──────────────────────────┤
│ 4a. 执行工具          │          │ 4b. 执行工具（可能多步） │
│ 5a. 模板格式化        │          │ 5b. LLM 深度生成         │
│    (跳过 LLM)         │          │    (~500 tokens)         │
└──────────────────────┘          └──────────────────────────┘
          ↓                                    ↓
┌─────────────────────────────────────────────────────────────┐
│  6. 反思与记忆更新（Reflect & Memory Update）               │
│     - 记录执行路径                                          │
│     - 更新会话上下文                                        │
│     - 评估效果（可选）                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧩 核心模块设计

### 模块 1: 上下文准备器（Context Preparer）

**职责**：为意图识别提供充分的上下文信息

**输入**：
- `goal`: string - 用户输入
- `userId`: string - 用户ID
- `sessionId`: string - 会话ID

**输出**：
```typescript
interface PreparedContext {
  goal: string;
  userId: string;
  sessionId: string;
  sessionContext: {
    recentTopics: string[];        // 最近讨论的话题
    summary: string;               // 会话摘要
    messageCount: number;          // 消息数量
  };
  relevantKnowledge: Array<{
    content: string;               // 知识内容（截取前100字）
    domain: string;                // 领域
    score: number;                 // 相关性得分
  }>;
  userProfile: {
    roleIds: string[];             // 用户角色
    permissions: string[];         // 权限列表
  };
}
```

**实现**：
```typescript
async function prepareContext(
  goal: string, 
  userId: string, 
  sessionId: string
): Promise<PreparedContext>
```

**依赖**：
- `getSessionContext(sessionId)` - 已有
- `searchKnowledge(goal, context, {limit: 3})` - 已有
- `getUserRoles(userId)` - 已有

---

### 模块 2: 意图识别器（Intent Recognizer）

**职责**：使用轻量 LLM 识别用户意图和任务复杂度

**输入**：`PreparedContext`

**输出**：
```typescript
interface RecognizedIntent {
  intent: IntentType;              // 意图类型
  complexity: ComplexityLevel;     // 复杂度
  tools: string[];                 // 所需工具列表
  params: Record<string, unknown>; // 工具参数
  confidence: number;              // 识别置信度 (0-1)
  reasoning: string;               // 判断理由
  requiresContext: boolean;        // 是否依赖上下文
}

type IntentType = 
  | 'time_query'           // 时间查询
  | 'knowledge_search'     // 知识搜索
  | 'status_check'         // 状态检查
  | 'troubleshooting'      // 故障排查
  | 'analysis'             // 分析评估
  | 'design'               // 方案设计
  | 'execution'            // 执行操作
  | 'conversation';        // 一般对话

type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex';
```

**LLM Prompt 设计**：
```typescript
const INTENT_RECOGNITION_PROMPT = `
你是一个任务复杂度评估专家。请分析用户输入并返回JSON。

用户输入: "${goal}"

会话上下文:
- 最近话题: ${recentTopics.join(', ')}
- 会话摘要: ${summary}
- 相关知识: ${relevantKnowledge}

请分析：
1. 用户的真实意图（intent）
2. 任务复杂度等级（complexity: trivial/simple/moderate/complex）
   - trivial: 单一信息查询，无需推理（如"几点"）
   - simple: 简单操作，单工具调用（如"搜索xxx"）
   - moderate: 需要2-3步推理或多工具（如"还有多久开会"）
   - complex: 多步推理、分析评估（如"分析性能瓶颈"）
3. 所需工具列表（tools）
4. 工具参数（params）
5. 是否依赖上下文（requiresContext）

返回JSON格式，不要解释：
{
  "intent": "...",
  "complexity": "...",
  "tools": [...],
  "params": {...},
  "confidence": 0.xx,
  "reasoning": "...",
  "requiresContext": true/false
}
`;
```

**实现**：
```typescript
async function recognizeIntent(
  context: PreparedContext
): Promise<RecognizedIntent>
```

**成本估算**：
- Token 消耗：~100 tokens/次（prompt 50 + response 50）
- API 成本：~0.002 元/次
- 延迟：~200ms

---

### 模块 3: 路由决策器（Router）

**职责**：根据意图识别结果决定使用系统1还是系统2

**决策规则**：

```typescript
function routeToSystem(intent: RecognizedIntent): 1 | 2 {
  // 规则1：复杂度 trivial + 高置信度 → 系统1
  if (intent.complexity === 'trivial' && intent.confidence > 0.8) {
    return 1;
  }
  
  // 规则2：复杂度 complex → 系统2
  if (intent.complexity === 'complex') {
    return 2;
  }
  
  // 规则3：依赖上下文 → 系统2
  if (intent.requiresContext) {
    return 2;
  }
  
  // 规则4：低置信度 → 系统2（安全兜底）
  if (intent.confidence < 0.7) {
    return 2;
  }
  
  // 规则5：需要多工具 → 系统2
  if (intent.tools.length > 1) {
    return 2;
  }
  
  // 默认：系统1
  return 1;
}
```

**输出**：
```typescript
interface RoutingDecision {
  system: 1 | 2;
  intent: RecognizedIntent;
  reasoning: string;
  estimatedLatency: number;  // 预估延迟
  estimatedCost: number;     // 预估成本
}
```

---

### 模块 4: 模板格式化器（Template Formatter）

**职责**：为系统1提供预定义的输出模板

**模板库**：
```typescript
interface OutputTemplate {
  intent: IntentType;
  format: (data: any) => string;
  fallback?: string;
}

const OUTPUT_TEMPLATES: OutputTemplate[] = [
  // 时间查询
  {
    intent: 'time_query',
    format: (data) => {
      if (!data?.locale) return '⚠️ 无法获取时间';
      return `🕐 当前时间: ${data.locale}`;
    },
  },
  
  // 知识搜索
  {
    intent: 'knowledge_search',
    format: (data) => {
      if (!data?.results || data.count === 0) {
        return `🔍 未找到「${data.query}」的相关知识`;
      }
      
      let output = `🔍 搜索结果（${data.count} 条）\n\n`;
      data.results.forEach((r: any, i: number) => {
        output += `**${i + 1}. ${r.title || '知识片段'}** (${r.score}分)\n`;
        output += `   ${r.content.slice(0, 150)}...\n\n`;
      });
      return output;
    },
  },
  
  // 状态检查
  {
    intent: 'status_check',
    format: (data) => {
      return `📊 系统状态\n\n${formatStatusData(data)}`;
    },
  },
];
```

**实现**：
```typescript
function formatWithTemplate(
  intent: IntentType, 
  toolResults: any[]
): string | null
```

---

### 模块 5: 性能监控器（Performance Monitor）

**职责**：监控双系统的使用情况和效果

**监控指标**：
```typescript
interface SystemMetrics {
  // 路由统计
  routing: {
    system1Count: number;
    system2Count: number;
    system1Ratio: number;    // 系统1使用率
  };
  
  // 性能统计
  performance: {
    system1AvgLatency: number;  // 平均延迟
    system2AvgLatency: number;
    latencyImprovement: number; // 改进百分比
  };
  
  // 成本统计
  cost: {
    totalLLMCalls: number;
    lightweightCalls: number;  // 轻量调用（意图识别）
    heavyweightCalls: number;  // 重量调用（结果生成）
    estimatedSavings: number;  // 预估节省
  };
  
  // 质量统计
  quality: {
    system1SuccessRate: number;
    system2SuccessRate: number;
    fallbackRate: number;       // 降级率
  };
}
```

**实现**：
```typescript
class PerformanceMonitor {
  recordRouting(system: 1 | 2, intent: RecognizedIntent): void;
  recordLatency(system: 1 | 2, latencyMs: number): void;
  recordLLMCall(type: 'lightweight' | 'heavyweight'): void;
  getMetrics(): SystemMetrics;
}
```

---

## 📋 详细 待办 清单

### Phase 6.1: 核心模块实现（第一周）

#### ✅ 已完成
- [x] 创建 complexity-assessor.ts（基础版本）
- [x] 扩展 types.ts（PlanStep/ActionResult metadata）
- [x] 创建测试文件框架

#### 🔄 需要重构

**Task 6.1.1: 上下文准备器**
- [ ] 创建 `src/agent/context-preparer.ts`
- [ ] 实现 `prepareContext()` 函数
  - [ ] 集成 `getSessionContext()`
  - [ ] 集成 `searchKnowledge()` (limit: 3)
  - [ ] 集成 `getUserRoles()`
  - [ ] 格式化为 PreparedContext
- [ ] 编写单元测试（5+ 用例）
  - [ ] 有会话上下文的情况
  - [ ] 无会话上下文的情况
  - [ ] 有相关知识的情况
  - [ ] 数据库不可用的降级

**预计工作量**: 2-3 小时  
**依赖**: 无  
**优先级**: P0

---

**Task 6.1.2: 意图识别器**
- [ ] 创建 `src/agent/intent-recognizer.ts`
- [ ] 设计意图识别 Prompt
  - [ ] 定义 Intent 类型枚举（8-10 种）
  - [ ] 设计复杂度判断标准
  - [ ] 设计 JSON 输出格式
- [ ] 实现 `recognizeIntent()` 函数
  - [ ] 构建 LLM Prompt
  - [ ] 调用 LLM（轻量模式）
  - [ ] 解析 JSON 结果
  - [ ] 错误处理和兜底
- [ ] 编写单元测试（10+ 用例）
  - [ ] 各种意图类型识别
  - [ ] 复杂度判断准确性
  - [ ] 上下文依赖识别
  - [ ] 低置信度兜底

**预计工作量**: 4-5 小时  
**依赖**: Task 6.1.1  
**优先级**: P0

---

**Task 6.1.3: 路由决策器**
- [ ] 创建 `src/agent/router.ts`
- [ ] 实现 `routeToSystem()` 函数
  - [ ] 定义完整决策规则（6+ 条）
  - [ ] 实现规则引擎
  - [ ] 记录决策日志
- [ ] 实现 `RoutingDecision` 类型
- [ ] 编写单元测试（8+ 用例）
  - [ ] 各种规则触发测试
  - [ ] 边界情况测试
  - [ ] 兜底机制测试

**预计工作量**: 2-3 小时  
**依赖**: Task 6.1.2  
**优先级**: P0

---

**Task 6.1.4: 模板格式化器**
- [ ] 创建 `src/agent/template-formatter.ts`
- [ ] 定义模板库
  - [ ] time_query 模板
  - [ ] knowledge_search 模板
  - [ ] status_check 模板
  - [ ] execution 模板（通用成功/失败）
- [ ] 实现 `formatWithTemplate()` 函数
- [ ] 实现模板渲染引擎
- [ ] 编写单元测试（6+ 用例）
  - [ ] 各种模板渲染
  - [ ] 数据缺失处理
  - [ ] 模板不存在兜底

**预计工作量**: 2-3 小时  
**依赖**: 无  
**优先级**: P0

---

**Task 6.1.5: 重构 Plan 模块**
- [ ] 修改 `src/agent/plan.ts`
- [ ] 集成上下文准备器
- [ ] 集成意图识别器
- [ ] 集成路由决策器
- [ ] 实现系统1路径
  - [ ] 生成 tool_call step
  - [ ] 生成 answer step (useTemplate: true)
- [ ] 实现系统2路径
  - [ ] 生成 tool_call step(s)
  - [ ] 生成 answer step (useLLM: true)
- [ ] 更新测试用例
  - [ ] 修复现有失败测试
  - [ ] 新增系统1/系统2路由测试

**预计工作量**: 3-4 小时  
**依赖**: Task 6.1.1, 6.1.2, 6.1.3  
**优先级**: P0

---

**Task 6.1.6: 重构 Act 模块**
- [ ] 修改 `src/agent/act.ts`
- [ ] 实现双路径 answer 处理
  ```typescript
  if (step.action === 'answer') {
    if (step.useTemplate) {
      // 系统1：模板格式化
      const result = formatWithTemplate(intent, toolResults);
      return { success: true, output: result, metadata: { system: 1 } };
    } else {
      // 系统2：LLM 生成
      const result = await generateReply(input);
      return { success: true, output: result, metadata: { system: 2 } };
    }
  }
  ```
- [ ] 集成模板格式化器
- [ ] 更新测试用例

**预计工作量**: 2-3 小时  
**依赖**: Task 6.1.4, 6.1.5  
**优先级**: P0

---

**Task 6.1.7: 性能监控器**
- [ ] 创建 `src/agent/performance-monitor.ts`
- [ ] 实现 `PerformanceMonitor` 类
  - [ ] recordRouting()
  - [ ] recordLatency()
  - [ ] recordLLMCall()
  - [ ] getMetrics()
- [ ] 集成到 Agent Loop
- [ ] 实现监控端点 `GET /api/agent/metrics`

**预计工作量**: 2-3 小时  
**依赖**: Task 6.1.5, 6.1.6  
**优先级**: P1

---

### Phase 6.2: 集成测试与优化（第二周）

**Task 6.2.1: 集成测试**
- [ ] 创建 `src/agent/__tests__/dual-system-integration.test.ts`
- [ ] 测试完整流程（20+ 用例）
  - [ ] 简单任务端到端（系统1）
  - [ ] 复杂任务端到端（系统2）
  - [ ] 上下文相关任务
  - [ ] 兜底机制验证
- [ ] Mock 外部依赖（LLM、数据库）

**预计工作量**: 4-5 小时  
**依赖**: Phase 6.1 全部完成  
**优先级**: P0

---

**Task 6.2.2: 模板库扩展**
- [ ] 收集常见简单任务（通过日志分析）
- [ ] 扩展模板库（10+ 模板）
- [ ] 优化模板可读性
- [ ] 添加多语言支持（可选）

**预计工作量**: 2-3 小时  
**依赖**: 线上数据  
**优先级**: P2

---

**Task 6.2.3: 意图识别 Prompt 优化**
- [ ] A/B 测试不同 Prompt 设计
- [ ] 收集识别错误案例
- [ ] 优化复杂度判断标准
- [ ] 提高置信度准确性

**预计工作量**: 3-4 小时  
**依赖**: Task 6.2.1 完成后有数据  
**优先级**: P1

---

**Task 6.2.4: 性能对比测试**
- [ ] 准备测试数据集（100+ 真实用户输入）
- [ ] 测试当前架构（基准）
  - [ ] 记录延迟
  - [ ] 记录 LLM 调用次数
  - [ ] 记录成本
- [ ] 测试双系统架构
  - [ ] 记录路由分布
  - [ ] 记录延迟改进
  - [ ] 记录成本节约
- [ ] 生成对比报告

**预计工作量**: 3-4 小时  
**依赖**: Phase 6.1 完成  
**优先级**: P1

---

### Phase 6.3: 文档与部署（第三周）

**Task 6.3.1: 技术文档**
- [ ] 创建 `docs/design/DUAL-SYSTEM-DESIGN.MD`
- [ ] 撰写架构设计说明
- [ ] 撰写 API 文档
- [ ] 撰写配置指南
- [ ] 撰写最佳实践

**预计工作量**: 2-3 小时  
**优先级**: P1

---

**Task 6.3.2: 部署与监控**
- [ ] 更新 K8s 部署配置
- [ ] 配置性能监控告警
- [ ] 灰度发布策略
- [ ] 回滚预案

**预计工作量**: 2-3 小时  
**优先级**: P0

---

**Task 6.3.3: 用户文档**
- [ ] 更新 README（新增双系统说明）
- [ ] 更新企微命令文档
- [ ] 撰写用户使用指南

**预计工作量**: 1-2 小时  
**优先级**: P2

---

## 🎓 开发要求与规范

### 代码质量要求

**1. 类型安全**
- ✅ 所有函数必须有明确的类型定义
- ✅ 避免使用 `any`，使用 `unknown` 并做类型守卫
- ✅ 接口和类型定义完整

**2. 测试覆盖**
- ✅ 单元测试覆盖率 > 80%
- ✅ 核心模块必须有测试
- ✅ 边界条件和错误处理覆盖

**3. 日志规范**
- ✅ 关键决策点必须记录日志
- ✅ 使用结构化日志（JSON）
- ✅ 日志级别正确（debug/info/warn/error）

**4. 错误处理**
- ✅ 所有外部调用必须 try-catch
- ✅ 错误必须有兜底机制
- ✅ 不能让用户看到技术错误

**5. 性能要求**
- ✅ 系统1 延迟 < 500ms
- ✅ 系统2 延迟 < 3s
- ✅ 意图识别 < 200ms

---

### 设计原则

**1. 向后兼容**
- ✅ 不能破坏现有功能
- ✅ 必须有开关（ENABLE_DUAL_SYSTEM=true/false）
- ✅ 可以平滑回滚

**2. 可观测性**
- ✅ 所有决策可追溯
- ✅ 性能数据可监控
- ✅ 问题可调试

**3. 可扩展性**
- ✅ 模板库易于扩展
- ✅ 意图类型易于新增
- ✅ 路由规则可配置

**4. 安全性**
- ✅ 低置信度必须降级到系统2
- ✅ 关键操作不能走系统1
- ✅ 权限检查不能跳过

---

## 📊 验收标准

### 功能验收

**1. 意图识别准确率**
- ✅ trivial 任务识别准确率 > 90%
- ✅ complex 任务识别准确率 > 85%
- ✅ 整体识别准确率 > 88%

**2. 性能提升**
- ✅ 系统1 延迟 < 当前的 20%
- ✅ 整体平均延迟降低 > 40%
- ✅ LLM 调用量减少 > 30%

**3. 成本节约**
- ✅ 月成本节约 > 25%
- ✅ Token 消耗减少 > 30%

**4. 质量保证**
- ✅ 用户满意度不下降
- ✅ 回答准确率不下降
- ✅ 错误率 < 2%

---

### 测试验收

**1. 单元测试**
- ✅ 所有模块测试覆盖率 > 80%
- ✅ 所有测试用例通过
- ✅ 无 TypeScript 编译错误

**2. 集成测试**
- ✅ 系统1 端到端测试通过
- ✅ 系统2 端到端测试通过
- ✅ 路由决策测试通过
- ✅ 兜底机制测试通过

**3. 压力测试**
- ✅ 并发 10 QPS 稳定
- ✅ 系统1 延迟 P95 < 500ms
- ✅ 系统2 延迟 P95 < 3s

---

## 📐 技术规格

### 意图识别 LLM 调用规格

**Prompt 长度**：
- 用户输入: ~50 tokens
- 上下文: ~50 tokens
- 指令: ~50 tokens
- **总计**: ~150 tokens

**Response 长度**：
- JSON 输出: ~50 tokens

**总消耗**: ~200 tokens/次

**成本**: ~0.004 元/次（按蓝鲸 AI 计费）

---

### 模板格式化规格

**模板类型**: 8-10 种

**模板要求**：
- 简洁清晰
- 包含关键信息
- 支持 Markdown
- 企微友好（避免表格）

**渲染性能**: < 10ms

---

### 路由决策规格

**决策时间**: < 1ms（纯逻辑判断）

**决策规则**: 6+ 条

**兜底策略**: 任何不确定的情况 → 系统2

---

## 🔬 A/B 测试计划

### 实验设计

**对照组**：当前架构（100% 系统2）  
**实验组**：双系统架构

**测试周期**：2 周

**测试指标**：
1. 平均响应延迟
2. P95 延迟
3. LLM 调用次数
4. 成本
5. 用户满意度
6. 错误率

**灰度策略**：
- 第1天: 10% 流量
- 第3天: 30% 流量
- 第7天: 50% 流量
- 第14天: 100% 流量（如果指标达标）

---

## ⚠️ 风险与缓解

### 风险1: 意图识别错误导致回答质量下降

**缓解措施**：
- ✅ 低置信度自动降级到系统2
- ✅ 用户反馈机制（"回答不满意？点击重试"）
- ✅ 监控错误率，超阈值自动回滚

### 风险2: 模板覆盖不全

**缓解措施**：
- ✅ 未匹配模板自动降级到系统2
- ✅ 持续扩展模板库
- ✅ 日志记录未覆盖的意图

### 风险3: 上下文检索影响性能

**缓解措施**：
- ✅ 上下文检索限制条数（top 3）
- ✅ 上下文检索超时保护（200ms）
- ✅ 缓存会话上下文

### 风险4: 增加系统复杂度

**缓解措施**：
- ✅ 模块化设计，职责清晰
- ✅ 完整的测试覆盖
- ✅ 详细的文档和注释

---

## 📅 时间规划

### 第一周（Phase 6.1）

**Day 1-2**: 核心模块实现
- Task 6.1.1: 上下文准备器（2-3h）
- Task 6.1.2: 意图识别器（4-5h）

**Day 3-4**: 路由与格式化
- Task 6.1.3: 路由决策器（2-3h）
- Task 6.1.4: 模板格式化器（2-3h）

**Day 5-7**: 集成与重构
- Task 6.1.5: 重构 Plan（3-4h）
- Task 6.1.6: 重构 Act（2-3h）
- Task 6.1.7: 性能监控器（2-3h）

---

### 第二周（Phase 6.2）

**Day 8-10**: 测试与优化
- Task 6.2.1: 集成测试（4-5h）
- Task 6.2.2: 模板库扩展（2-3h）
- Task 6.2.3: Prompt 优化（3-4h）

**Day 11-12**: 性能验证
- Task 6.2.4: 性能对比测试（3-4h）

---

### 第三周（Phase 6.3）

**Day 13-14**: 文档与部署
- Task 6.3.1: 技术文档（2-3h）
- Task 6.3.2: 部署与监控（2-3h）
- Task 6.3.3: 用户文档（1-2h）

**Day 15-21**: 灰度发布与监控

---

## 💡 后续演进方向

完成 Phase 6 后，可以继续：

**Phase 7: 三级记忆模型升级**
- 扩展 memory_type（episodic/semantic/procedural）
- 实现检索策略路由
- 新增 workflows 表

**Phase 8: 元认知反思系统**
- 实现推理质量评估
- 实现策略自动优化
- 实现知识自动沉淀

**Phase 9: 免疫系统（抗体生成器）**
- 实现失败模式记忆
- 实现自动修复脚本
- 实现故障自愈

---

## 📊 预期效果总结

### 性能指标

| 指标 | 当前 | 优化后 | 提升 |
|------|------|--------|------|
| 平均延迟 | 2.5s | 1.2s | ↓ 52% |
| 系统1延迟 | - | 0.3s | - |
| 系统2延迟 | 2.5s | 2.8s | ↓ 12% |
| LLM 调用 | 1000次/天 | 700次/天 | ↓ 30% |
| 月成本 | ¥1000 | ¥700 | ↓ 30% |

### 质量指标

| 指标 | 要求 |
|------|------|
| 意图识别准确率 | > 88% |
| 系统1成功率 | > 95% |
| 系统2成功率 | > 90% |
| 用户满意度 | 不下降 |

---

**文档版本**: v1.0  
**创建时间**: 2026-02-07 23:10  
**负责人**: shamcleren + OpenClaw AI  
**审核状态**: 待用户审核
