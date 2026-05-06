#!/usr/bin/env node
/**
 * 效果调优回放测试（共享 baseline）
 *
 * 默认基于 eval/effect-tuning-shared-baseline.json 中的 A/B/C/D/E case，
 * 逐个发起 /api/chat 请求，验证系统行为是否符合预期。
 *
 * 用法：
 *   AUTH_TOKEN=xxx node scripts/test/test-effect-tuning-replay.js
 *   BASE_URL=http://127.0.0.1:3001 AUTH_TOKEN=xxx node scripts/test/test-effect-tuning-replay.js
 *   CASE_FILTER=ET-A2 AUTH_TOKEN=xxx node scripts/test/test-effect-tuning-replay.js
 *   CASES_FILE=eval/effect-tuning-release-gate.json AUTH_TOKEN=xxx node scripts/test/test-effect-tuning-replay.js
 */

const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const CASE_FILTER = String(process.env.CASE_FILTER || '').trim();
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 120000);

// LLM-as-Judge 配置：从环境变量或 .env.secrets 读取
const JUDGE_ENABLED = process.env.JUDGE_ENABLED !== '0'; // 默认开启
const JUDGE_BK_AI_GATEWAY_URL = process.env.BK_AI_GATEWAY_URL || '';
const JUDGE_BK_APP_CODE = process.env.BK_APP_CODE || '';
const JUDGE_BK_APP_SECRET = process.env.BK_APP_SECRET || '';
const JUDGE_OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const JUDGE_OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
const JUDGE_MODEL = process.env.JUDGE_MODEL || process.env.BK_LLM_MODEL || 'hunyuan';

// 自动加载 .env.secrets（如果环境变量没配齐）
function loadEnvSecrets() {
  const envFiles = [
    path.resolve(__dirname, '../../.env.secrets'),

  ];
  for (const f of envFiles) {
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // 去除引号
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnvSecrets();

// 重新读取（可能从 .env.secrets 补齐了）
const judgeGatewayUrl = process.env.BK_AI_GATEWAY_URL || JUDGE_BK_AI_GATEWAY_URL;
const judgeAppCode = process.env.BK_APP_CODE || JUDGE_BK_APP_CODE;
const judgeAppSecret = process.env.BK_APP_SECRET || JUDGE_BK_APP_SECRET;
const judgeOpenaiKey = process.env.OPENAI_API_KEY || JUDGE_OPENAI_API_KEY;
const judgeOpenaiBase = process.env.OPENAI_BASE_URL || JUDGE_OPENAI_BASE_URL;
const judgeModel = process.env.JUDGE_MODEL || process.env.BK_LLM_MODEL || JUDGE_MODEL;

function hasJudgeLLM() {
  if (!JUDGE_ENABLED) return false;
  if (judgeGatewayUrl && judgeAppCode && judgeAppSecret) return true;
  if (judgeOpenaiKey) return true;
  return false;
}

/**
 * LLM-as-Judge：用 LLM 语义评判回复是否满足评测标准
 *
 * @param {string} userPrompt  - 用户的原始提问
 * @param {string} response    - 系统的实际回复
 * @param {string[]} criteria  - 评判标准列表（自然语言）
 * @returns {{ pass: boolean, reasoning: string, criteriaResults: {criterion: string, pass: boolean, reason: string}[] }}
 */
async function callJudgeLLM(userPrompt, response, criteria) {
  const systemPrompt = `你是一个 AI 回复质量评审员。你需要判断一个 SRE 排障助手的回复是否满足给定的评测标准。

## 评审规则
1. 逐条检查每个评测标准，判断回复是否满足
2. 关注语义而非字面措辞——只要意思到了就算满足，不要求精确用词
3. 综合所有标准给出最终 pass/fail 判定
4. 保持客观，不要因为回复内容详细就自动判 pass

## 输出格式
严格输出以下 JSON，不要输出其他内容：
{
  "pass": true/false,
  "reasoning": "一句话总结判定理由",
  "criteriaResults": [
    { "criterion": "标准1原文", "pass": true/false, "reason": "判定理由" }
  ]
}`;

  const userMsg = `## 用户提问
${userPrompt}

## 系统回复
${response.slice(0, 3000)}

## 评测标准
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

请逐条评审并输出 JSON 结果。`;

  let url, headers, body;

  if (judgeGatewayUrl && judgeAppCode && judgeAppSecret) {
    // 蓝鲸 AI
    const base = judgeGatewayUrl.replace(/\/$/, '');
    url = base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      'X-Bkapi-Authorization': JSON.stringify({
        bk_app_code: judgeAppCode,
        bk_app_secret: judgeAppSecret,
        bk_username: 'admin',
      }),
    };
    body = {
      model: judgeModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    };
  } else if (judgeOpenaiKey) {
    // OpenAI 兼容
    const base = judgeOpenaiBase.replace(/\/$/, '');
    url = base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${judgeOpenaiKey.trim()}`,
    };
    body = {
      model: judgeModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    };
  } else {
    return { pass: false, reasoning: 'Judge LLM 未配置', criteriaResults: [] };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    // 提取 JSON（可能包裹在 ```json ... ``` 中）
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { pass: false, reasoning: `Judge LLM 返回无法解析: ${content.slice(0, 200)}`, criteriaResults: [] };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      pass: !!parsed.pass,
      reasoning: parsed.reasoning || '',
      criteriaResults: Array.isArray(parsed.criteriaResults) ? parsed.criteriaResults : [],
    };
  } catch (err) {
    return { pass: false, reasoning: `Judge LLM 调用失败: ${err.message || err}`, criteriaResults: [] };
  }
}

if (!AUTH_TOKEN) {
  console.error('missing AUTH_TOKEN');
  process.exit(2);
}

const casesPath = process.env.CASES_FILE
  ? path.resolve(process.env.CASES_FILE)
  : path.resolve(__dirname, '../../eval/effect-tuning-shared-baseline.json');
const casesData = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));

const cases = CASE_FILTER
  ? casesData.cases.filter((c) => c.id === CASE_FILTER || c.category === CASE_FILTER || c.subcategory === CASE_FILTER)
  : casesData.cases;

if (cases.length === 0) {
  console.error(`No cases matched filter: ${CASE_FILTER || '(none)'}`);
  process.exit(2);
}

async function callChat(message, userId, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = { message };
    if (userId) body.userId = userId;
    if (context && typeof context === 'object' && !Array.isArray(context) && Object.keys(context).length > 0) {
      body.context = context;
    }
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

// 工具→类别映射表：将具体工具名归类到逻辑类别
const TOOL_CLASS_MAP = {
  // unify_query 类：所有走蓝鲸统一查询面的工具
  query_promql: 'unify_query',
  query_metrics: 'unify_query',
  query_log: 'unify_query',
  query_trace: 'unify_query',
  list_tag_keys: 'unify_query',
  list_tag_values: 'unify_query',
  list_field_keys: 'unify_query',
  // relation 类
  query_relation_multi_resource: 'relation',
  query_relation_multi_resource_range: 'relation',
  // knowledge 类
  search_knowledge: 'knowledge',
  mcp_search_knowledge: 'knowledge',
  // k8s 类
  k8s_management: 'k8s',
  // ssh 类
  ssh_execute: 'ssh',
};

function inferToolClasses(toolName) {
  const name = String(toolName).toLowerCase();
  const classes = new Set();
  // 精确映射
  if (TOOL_CLASS_MAP[name]) classes.add(TOOL_CLASS_MAP[name]);
  // 模糊匹配兜底
  if (name.includes('query_') || name.includes('list_tag') || name.includes('list_field')) classes.add('unify_query');
  if (name.includes('relation')) classes.add('relation');
  if (name.includes('knowledge')) classes.add('knowledge');
  if (name.includes('k8s')) classes.add('k8s');
  if (name.includes('ssh')) classes.add('ssh');
  return [...classes];
}

function extractMetadata(data) {
  const meta = data?.data?.metadata || {};
  // 安全提取 toolPlan：确保每个元素被正确序列化
  const rawToolPlan = meta.intentDecision?.toolPlan || [];
  const toolPlan = Array.isArray(rawToolPlan)
    ? rawToolPlan.map((t) => {
        if (typeof t === 'string') return t;
        return t?.toolName || t?.tool || JSON.stringify(t);
      })
    : [];
  return {
    phase: meta.phase || '',
    stepCount: meta.stepCount || 0,
    scenario: meta.scenario || '',
    intent: meta.intentDecision?.intent || meta.intent || '',
    toolPlan,
    selectedToolClasses: Array.isArray(meta.v2RuntimeObservability?.selectedToolClasses)
      ? meta.v2RuntimeObservability.selectedToolClasses.map((item) => String(item || '').toLowerCase()).filter(Boolean)
      : [],
    // toolCalls 是实际执行的工具调用记录（包含 tool 名和 success 状态）
    toolCalls: (meta.toolCalls || []).map((t) => ({
      tool: t.tool || t.toolName || '',
      success: t.success,
      resultSummary: typeof t.resultSummary === 'string' ? t.resultSummary.slice(0, 200) : '',
    })),
    toolRouting: meta.toolRouting || null,
    toolRoutingSource: meta.toolRoutingSource || '',
    needClarification: meta.needClarification || false,
    evidenceItems: meta.evidenceItems || [],
    validationProgress: meta.validationProgress || null,
    blocker: meta.blocker || null,
  };
}

function extractResponse(data) {
  return data?.data?.response || data?.data?.output || data?.response || data?.output || '';
}

async function checkExpectation(caseItem, response, metadata) {
  const expect = caseItem.expect;
  const checks = [];
  const responseText = String(response || '');

  // 检查 must_contain
  if (Array.isArray(expect.must_contain)) {
    for (const keyword of expect.must_contain) {
      const hit = responseText.includes(keyword);
      checks.push({
        check: `must_contain:${keyword}`,
        pass: hit,
        detail: hit ? 'found' : 'missing',
      });
    }
  }

  // 检查 must_contain_any（每组关键词中命中任一即通过）
  if (Array.isArray(expect.must_contain_any)) {
    for (const group of expect.must_contain_any) {
      if (!Array.isArray(group)) continue;
      const hits = group.filter((kw) => responseText.includes(kw));
      const pass = hits.length > 0;
      checks.push({
        check: `must_contain_any:[${group.join('|')}]`,
        pass,
        detail: pass ? `found: ${hits.join(', ')}` : 'none matched',
      });
    }
  }

  // ========== LLM-as-Judge：语义评判 ==========
  if (Array.isArray(expect.semantic_criteria) && expect.semantic_criteria.length > 0) {
    if (hasJudgeLLM()) {
      console.log(`    🤖 calling Judge LLM for ${expect.semantic_criteria.length} criteria...`);
      const judgeResult = await callJudgeLLM(caseItem.prompt, responseText, expect.semantic_criteria);
      // 每条 criterion 单独记录
      if (judgeResult.criteriaResults.length > 0) {
        for (const cr of judgeResult.criteriaResults) {
          checks.push({
            check: `semantic:${cr.criterion.slice(0, 60)}`,
            pass: cr.pass,
            detail: cr.reason || (cr.pass ? 'satisfied' : 'not satisfied'),
          });
        }
      } else {
        // Judge 返回了整体结果但没有逐条
        checks.push({
          check: 'semantic_criteria(overall)',
          pass: judgeResult.pass,
          detail: judgeResult.reasoning || 'no detail',
        });
      }
    } else {
      // Judge LLM 不可用，标记为 skip（不影响 pass/fail）
      console.log('    ⚠️  Judge LLM not available, semantic criteria skipped');
      for (const criterion of expect.semantic_criteria) {
        checks.push({
          check: `semantic:${criterion.slice(0, 60)}`,
          pass: true,
          detail: 'SKIPPED (no judge LLM)',
        });
      }
    }
  }

  // 检查 must_not_contain
  if (Array.isArray(expect.must_not_contain)) {
    for (const keyword of expect.must_not_contain) {
      const hit = responseText.includes(keyword);
      checks.push({
        check: `must_not_contain:${keyword}`,
        pass: !hit,
        detail: hit ? 'found (bad)' : 'absent (good)',
      });
    }
  }

  // 检查 max_reply_length
  if (expect.max_reply_length && responseText.length > expect.max_reply_length) {
    checks.push({
      check: 'max_reply_length',
      pass: false,
      detail: `length=${responseText.length}, max=${expect.max_reply_length}`,
    });
  } else if (expect.max_reply_length) {
    checks.push({
      check: 'max_reply_length',
      pass: true,
      detail: `length=${responseText.length}, max=${expect.max_reply_length}`,
    });
  }

  // 检查 must_not_contain_long_manual（回复不应像泛化排障手册）
  if (expect.must_not_contain_long_manual) {
    const manualSignals = ['第一步', '第二步', '第三步', '排查步骤：', '排查清单', '常见原因包括'];
    const manualHits = manualSignals.filter((s) => responseText.includes(s)).length;
    const isManual = manualHits >= 2 && responseText.length > 600;
    checks.push({
      check: 'must_not_be_manual',
      pass: !isManual,
      detail: isManual ? `manual_signals=${manualHits}, length=${responseText.length}` : 'ok',
    });
  }

  // 检查 should_resolve_service（service_locator 应该 resolved，不应停在 request_evidence）
  // v1.1: 收紧检查——只看 metadata 信号，不再做宽泛的回复文本匹配
  // 因为排障回复中提到"提供服务名"是正常的引导语，不代表停在了 request_evidence
  if (expect.should_resolve_service) {
    const isRequestEvidence = metadata.phase === 'request_evidence'
      || metadata.needClarification
      || (metadata.stepCount <= 1 && /请先提供.*服务名|无法定位.*请补充/.test(responseText));
    checks.push({
      check: 'should_resolve_service',
      pass: !isRequestEvidence,
      detail: isRequestEvidence
        ? `stopped at request_evidence (phase=${metadata.phase}, steps=${metadata.stepCount})`
        : `continued investigation (phase=${metadata.phase}, steps=${metadata.stepCount})`,
    });
  }

  // 检查 must_not_action
  if (expect.must_not_action === 'request_evidence') {
    const isRequestEvidence = metadata.phase === 'request_evidence'
      || metadata.needClarification;
    checks.push({
      check: 'must_not_request_evidence',
      pass: !isRequestEvidence,
      detail: isRequestEvidence ? 'triggered request_evidence (bad)' : 'ok',
    });
  }

  // 检查 action === request_evidence
  if (expect.action === 'request_evidence') {
    const isRequestEvidence = metadata.needClarification
      || /补充|补齐|缺失材料|先补|提供|请告诉/.test(responseText);
    checks.push({
      check: 'action_is_request_evidence',
      pass: isRequestEvidence,
      detail: isRequestEvidence ? 'correctly requested evidence' : 'did not request evidence',
    });
  }

  // 检查 should_not_call_tools
  if (Array.isArray(expect.should_not_call_tools)) {
    const planTools = (metadata.toolPlan || []).map((t) => String(t.toolName || t.tool || t));
    const callTools = (metadata.toolCalls || []).map((t) => t.tool || '');
    const allTools = [...planTools, ...callTools].map(String);
    for (const banned of expect.should_not_call_tools) {
      const bannedLower = banned.toLowerCase();
      const called = allTools.some((t) => {
        const tl = t.toLowerCase();
        // 直接包含匹配
        if (tl.includes(bannedLower)) return true;
        // 通过类别映射匹配
        const classes = inferToolClasses(tl);
        return classes.includes(bannedLower);
      });
      checks.push({
        check: `should_not_call:${banned}`,
        pass: !called,
        detail: called ? 'was called (bad)' : 'not called (good)',
      });
    }
  }

  // 检查 preferred_tool_classes
  // 同时从 toolPlan（意图预规划）和 toolCalls（实际执行）中查找
  // 使用 inferToolClasses 将具体工具名映射到逻辑类别
  if (Array.isArray(expect.preferred_tool_classes)) {
    const planTools = (metadata.toolPlan || []).map((t) => String(t.toolName || t.tool || t).toLowerCase());
    const callTools = (metadata.toolCalls || []).map((t) => String(t.tool || '').toLowerCase());
    const allTools = [...new Set([...planTools, ...callTools])];
    // 收集所有工具对应的逻辑类别
    const allClasses = new Set(metadata.selectedToolClasses || []);
    for (const t of allTools) {
      for (const cls of inferToolClasses(t)) {
        allClasses.add(cls);
      }
    }
    for (const cls of expect.preferred_tool_classes) {
      const classLower = cls.toLowerCase();
      const hit = allClasses.has(classLower)
        || allTools.some((t) => t.includes(classLower) || t.includes(classLower.replace('_', '')));
      checks.push({
        check: `preferred_class:${cls}`,
        pass: hit,
        detail: hit
          ? `matched (tools: [${allTools.join(', ')}], classes: [${[...allClasses].join(', ')}])`
          : `not matched in [${allTools.join(', ')}] (classes: [${[...allClasses].join(', ')}])`,
      });
    }
  }

  // 检查 preferred_tools
  if (Array.isArray(expect.preferred_tools)) {
    const planTools = (metadata.toolPlan || []).map((t) => String(t.toolName || t.tool || t).toLowerCase());
    const callTools = (metadata.toolCalls || []).map((t) => String(t.tool || '').toLowerCase());
    const allTools = [...new Set([...planTools, ...callTools])];
    for (const toolName of expect.preferred_tools) {
      const hit = allTools.some((t) => t === toolName.toLowerCase());
      checks.push({
        check: `preferred_tool:${toolName}`,
        pass: hit,
        detail: hit ? 'matched' : `not in [${allTools.join(', ')}]`,
      });
    }
  }

  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  return { passed, total, checks, overall: passed === total ? 'PASS' : 'FAIL' };
}

async function main() {
  // Judge LLM 状态检查
  if (hasJudgeLLM()) {
    const provider = (judgeGatewayUrl && judgeAppCode) ? 'bk_ai' : 'openai';
    console.log(`🤖 Judge LLM: enabled (provider=${provider}, model=${judgeModel})`);
  } else {
    console.log('⚠️  Judge LLM: disabled (semantic criteria will be skipped)');
    console.log('   Set BK_AI_GATEWAY_URL + BK_APP_CODE + BK_APP_SECRET, or OPENAI_API_KEY to enable.');
  }

  const report = {
    summary: 'FAILED',
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    filter: CASE_FILTER || '(all)',
    total: cases.length,
    passed: 0,
    failed: 0,
    categorySummary: {},
    cases: [],
  };

  for (const c of cases) {
    const startTime = Date.now();
    console.log(`\n[${c.id}] ${c.title}`);
    console.log(`  prompt: ${c.prompt.slice(0, 80)}...`);

    try {
      await callChat('/new');
    } catch (err) {
      console.warn(`  WARN: reset session failed before ${c.id}: ${err.message || err}`);
    }

    let response = '';
    let metadata = {};
    let httpStatus = 0;

    try {
      const result = await callChat(c.prompt, c.context?.user_id, c.context);
      httpStatus = result.status;
      response = extractResponse(result.data);
      metadata = extractMetadata(result.data);
    } catch (err) {
      console.log(`  ERROR: ${err.message || err}`);
      report.cases.push({
        id: c.id,
        category: c.category,
        subcategory: c.subcategory,
        title: c.title,
        status: 'ERROR',
        error: String(err.message || err),
        durationMs: Date.now() - startTime,
      });
      report.failed += 1;
      continue;
    }

    const durationMs = Date.now() - startTime;
    const result = await checkExpectation(c, response, metadata);

    console.log(`  http=${httpStatus}, phase=${metadata.phase}, steps=${metadata.stepCount}, duration=${durationMs}ms`);
    console.log(`  checks: ${result.passed}/${result.total} -> ${result.overall}`);
    for (const check of result.checks) {
      const mark = check.pass ? '✓' : '✗';
      console.log(`    ${mark} ${check.check}: ${check.detail}`);
    }
    console.log(`  reply: ${response.slice(0, 150)}...`);

    const caseResult = {
      id: c.id,
      category: c.category,
      subcategory: c.subcategory,
      title: c.title,
      status: result.overall,
      httpStatus,
      durationMs,
      checks: result.checks,
      metadata: {
        phase: metadata.phase,
        stepCount: metadata.stepCount,
        scenario: metadata.scenario,
        intent: metadata.intent,
        toolPlan: metadata.toolPlan,
        toolCalls: metadata.toolCalls,
        blocker: metadata.blocker,
      },
      replySnippet: response.slice(0, 300),
    };
    report.cases.push(caseResult);

    if (result.overall === 'PASS') {
      report.passed += 1;
    } else {
      report.failed += 1;
    }

    // 更新分类汇总
    if (!report.categorySummary[c.category]) {
      report.categorySummary[c.category] = { total: 0, passed: 0, failed: 0 };
    }
    report.categorySummary[c.category].total += 1;
    if (result.overall === 'PASS') report.categorySummary[c.category].passed += 1;
    else report.categorySummary[c.category].failed += 1;
  }

  report.summary = report.failed === 0 ? 'PASS' : 'FAILED';

  // 输出报告（机读回放结果统一落盘到 eval/reports，而不是 docs/verification）
  const reportPath = path.resolve(__dirname, '../../eval/reports',
    `BASELINE-REPLAY-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}.json`);

  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved: ${reportPath}`);
  } catch (e) {
    console.log(`\nFailed to save report: ${e.message}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Effect Tuning Replay: ${report.summary}`);
  console.log(`Total: ${report.total}, Passed: ${report.passed}, Failed: ${report.failed}`);
  for (const [cat, stats] of Object.entries(report.categorySummary)) {
    console.log(`  ${cat}: ${stats.passed}/${stats.total}`);
  }
  console.log('='.repeat(60));

  process.exit(report.summary === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exit(1);
});
