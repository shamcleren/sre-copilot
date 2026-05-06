#!/usr/bin/env node
/**
 * 对话入口验收：专家角色排障能力
 *
 * 目标：
 *  - 通过 /api/chat 验证排障类问题是否给出可执行回答
 *  - 覆盖典型故障语义：MCP 连接失败、数据库连接异常、服务超时
 *  - 支持显式 V2 路由校验，并输出 route metadata / phase timings / runtime summary
 *  - 输出结构化 JSON 报告，便于回归对比
 *
 * 用法：
 *   AUTH_TOKEN=xxx node scripts/test/test-expert-diagnosis-entry.js
 *   BASE_URL=http://127.0.0.1:3001 AUTH_TOKEN=xxx CHAT_ROUTE=v2 EXPECT_ROUTE=v2 REQUIRE_NO_FALLBACK=1 VERIFY_ROUTE_RUNTIME_SUMMARY=1 node scripts/test/test-expert-diagnosis-entry.js
 */

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const CHAT_ROUTE = String(process.env.CHAT_ROUTE || '').trim().toLowerCase();
const EXPECT_ROUTE = String(process.env.EXPECT_ROUTE || CHAT_ROUTE || '').trim().toLowerCase();
const REQUEST_TIMEOUT_MS = Math.max(1000, Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '90000', 10) || 90000);

function isTruthyEnv(value, fallback = false) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

const REQUIRE_NO_FALLBACK = isTruthyEnv(process.env.REQUIRE_NO_FALLBACK, EXPECT_ROUTE === 'v2');
const REQUIRE_V2_RUNTIME = isTruthyEnv(process.env.REQUIRE_V2_RUNTIME, EXPECT_ROUTE === 'v2');
const VERIFY_ROUTE_RUNTIME_SUMMARY = isTruthyEnv(process.env.VERIFY_ROUTE_RUNTIME_SUMMARY, EXPECT_ROUTE === 'v2');

if (!AUTH_TOKEN) {
  console.error('missing AUTH_TOKEN');
  process.exit(2);
}

const CASES = [
  {
    id: 'diag-mcp-timeout',
    prompt:
      '你是排障专家。我们注册 MCP 后调用超时（connect ETIMEDOUT），请给我排查步骤和下一步建议。',
  },
  {
    id: 'diag-db-auth',
    prompt:
      '你是排障专家。服务日志显示 password authentication failed for user postgres，请定位原因并给修复建议。',
  },
  {
    id: 'diag-service-unavailable',
    prompt:
      '你是排障专家。用户访问出现 503 Service Unavailable，请给一个分层排查清单（入口层、应用层、依赖层）。',
  },
];

function hasActionableSignal(text) {
  const s = String(text || '');
  if (!s || s.length < 40) return false;
  const keys = ['建议', '排查', '检查', '步骤', '原因', '修复', '下一步'];
  const hit = keys.filter((k) => s.includes(k)).length;
  const placeholder = /占位回复|未配置 LLM|暂时无法生成回复/.test(s);
  return hit >= 2 && !placeholder;
}

function buildHeaders() {
  const headers = {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (CHAT_ROUTE) {
    headers['x-sre-copilot-route'] = CHAT_ROUTE;
  }
  return headers;
}

function buildRouteChecks(metadata) {
  const routeMetadata = metadata?.routeMetadata || {};
  const actualRoute = String(routeMetadata.actualRoute || '').trim().toLowerCase();
  const fallbackToV1 = routeMetadata.fallbackToV1 === true;
  const runtimeObservability = metadata?.v2RuntimeObservability || {};
  const hasV2Runtime = runtimeObservability && Object.keys(runtimeObservability).length > 0;
  const failures = [];

  if (EXPECT_ROUTE && actualRoute !== EXPECT_ROUTE) {
    failures.push(`actualRoute=${actualRoute || 'unknown'} expected=${EXPECT_ROUTE}`);
  }
  if (REQUIRE_NO_FALLBACK && fallbackToV1) {
    failures.push('fallbackToV1=true');
  }
  if (REQUIRE_V2_RUNTIME && !hasV2Runtime) {
    failures.push('missing v2RuntimeObservability');
  }

  return {
    ok: failures.length === 0,
    failures,
    routeMetadata,
    runtimeObservability,
    phaseTimings: metadata?.phaseTimings || {},
  };
}

async function callChat(message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const startedAt = Date.now();
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return {
      status: res.status,
      data,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRouteRuntimeSummary(startDate) {
  const url = new URL('/api/admin/chat-route-runtime/summary', BASE_URL);
  if (startDate) {
    url.searchParams.set('startDate', startDate);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

function buildCaseDetail(params) {
  const {
    status,
    phase,
    stepCount,
    elapsedMs,
    output,
    routeMetadata,
    runtimeObservability,
    phaseTimings,
    routeFailures,
  } = params;

  const parts = [
    `http=${status}`,
    `phase=${phase || 'unknown'}`,
    `steps=${stepCount}`,
    `elapsedMs=${elapsedMs}`,
    `actualRoute=${routeMetadata.actualRoute || 'unknown'}`,
    `requestedRoute=${routeMetadata.requestedRoute || 'unknown'}`,
    `fallback=${routeMetadata.fallbackToV1 === true}`,
    `intentInferMs=${phaseTimings.intentInferMs || 0}`,
    `v2RouteMs=${phaseTimings.v2RouteMs || 0}`,
    `mode=${runtimeObservability.mode || 'n/a'}`,
  ];

  if (routeFailures.length > 0) {
    parts.push(`routeChecks=${routeFailures.join(',')}`);
  }

  parts.push(`reply=${String(output).slice(0, 180)}`);
  return parts.join(', ');
}

async function main() {
  const scriptStartAt = new Date().toISOString();
  const report = {
    summary: 'FAILED',
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    chatRoute: CHAT_ROUTE || 'auto',
    expectRoute: EXPECT_ROUTE || 'none',
    requireNoFallback: REQUIRE_NO_FALLBACK,
    requireV2Runtime: REQUIRE_V2_RUNTIME,
    verifyRouteRuntimeSummary: VERIFY_ROUTE_RUNTIME_SUMMARY,
    total: CASES.length + (VERIFY_ROUTE_RUNTIME_SUMMARY ? 1 : 0),
    passed: 0,
    failed: 0,
    cases: [],
    routeRuntimeSummary: null,
  };

  for (const c of CASES) {
    const item = { id: c.id, status: 'FAIL', detail: '' };
    try {
      const { status, data, elapsedMs } = await callChat(c.prompt);
      const output =
        data?.data?.response || data?.data?.output || data?.response || data?.output || '';
      const metadata = data?.data?.metadata || data?.metadata || {};
      const phase = metadata?.phase || '';
      const stepCount = metadata?.stepCount || 0;
      const routeChecks = buildRouteChecks(metadata);
      const ok = status === 200 && hasActionableSignal(output) && routeChecks.ok;

      item.status = ok ? 'PASS' : 'FAIL';
      item.detail = buildCaseDetail({
        status,
        phase,
        stepCount,
        elapsedMs,
        output,
        routeMetadata: routeChecks.routeMetadata,
        runtimeObservability: routeChecks.runtimeObservability,
        phaseTimings: routeChecks.phaseTimings,
        routeFailures: routeChecks.failures,
      });
    } catch (err) {
      item.status = 'FAIL';
      item.detail = String(err && err.message ? err.message : err);
    }

    report.cases.push(item);
    if (item.status === 'PASS') report.passed += 1;
    else report.failed += 1;
  }

  if (VERIFY_ROUTE_RUNTIME_SUMMARY) {
    const summaryItem = { id: 'route-runtime-summary', status: 'FAIL', detail: '' };
    try {
      const { status, data } = await fetchRouteRuntimeSummary(scriptStartAt);
      const summary = data?.data || {};
      report.routeRuntimeSummary = summary;
      const fallbackCount = Number(summary.fallbackCount || 0);
      const handledV2Count = Number(summary.handledV2Count || 0);
      const totalAttempts = Number(summary.totalAttempts || 0);
      const databaseAvailable = summary.databaseAvailable === true;
      const v2RuntimeSamples = Number(summary.v2RuntimeSamples || 0);
      const intentPhaseSamples = Number(summary.intentPhaseSamples || 0);
      const needsV2Handled = EXPECT_ROUTE === 'v2';
      const ok = status === 200
        && databaseAvailable
        && totalAttempts >= CASES.length
        && (!needsV2Handled || handledV2Count >= CASES.length)
        && (!REQUIRE_NO_FALLBACK || fallbackCount === 0)
        && (!REQUIRE_V2_RUNTIME || v2RuntimeSamples >= 1)
        && intentPhaseSamples >= 1;

      summaryItem.status = ok ? 'PASS' : 'FAIL';
      summaryItem.detail = `http=${status}, totalAttempts=${totalAttempts}, handledV2=${handledV2Count}, fallback=${fallbackCount}, intentSamples=${intentPhaseSamples}, v2RuntimeSamples=${v2RuntimeSamples}, databaseAvailable=${databaseAvailable}`;
    } catch (err) {
      summaryItem.status = 'FAIL';
      summaryItem.detail = String(err && err.message ? err.message : err);
    }

    report.cases.push(summaryItem);
    if (summaryItem.status === 'PASS') report.passed += 1;
    else report.failed += 1;
  }

  report.summary = report.failed === 0 ? 'PASS' : 'FAILED';
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
