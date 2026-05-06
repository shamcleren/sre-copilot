#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || '').trim();
const MATRIX_FILE = process.env.MATRIX_FILE
  ? path.resolve(process.env.MATRIX_FILE)
  : path.resolve(__dirname, 'chatops-parse-api-matrix.json');
const REPORT_DIR = process.env.REPORT_DIR
  ? path.resolve(process.env.REPORT_DIR)
  : path.resolve(__dirname, '..', '..', 'docs', 'verification');

if (!AUTH_TOKEN) {
  console.error('missing AUTH_TOKEN (env required)');
  process.exit(2);
}

const FAILURE_LAYER = {
  API_CONTRACT: 'api-contract',
  INTENT_ROUTING: 'intent-routing',
  ACTION_EXTRACTION: 'action-extraction',
  GUIDE_FALLBACK: 'guide-fallback',
};

function pushFailure(failures, layers, caseId, layer, check, message) {
  const row = { caseId, layer, check, message };
  failures.push(row);
  if (!layers[layer]) layers[layer] = [];
  layers[layer].push(row);
}

function assertCase(caseId, condition, layer, check, message, failures, layers) {
  if (!condition) pushFailure(failures, layers, caseId, layer, check, message);
}

function makeCase(id, input, expect) {
  return { id, input, expect };
}

function applyRobustnessTransforms(input) {
  const raw = String(input || '');
  const variants = new Set([raw]);
  const transforms = [
    (s) => s.replace(/查看/g, '查下'),
    (s) => s.replace(/查看/g, '看下'),
    (s) => s.replace(/工具/g, '工县'),
    (s) => s.replace(/角色/g, '脚色'),
    (s) => s.replace(/删除/g, '删掉'),
    (s) => s.replace(/，/g, ','),
    (s) => s.replace(/。/g, ''),
    (s) => s.replace(/\s+/g, ' ').trim(),
  ];
  for (const tf of transforms) {
    for (const existing of Array.from(variants)) {
      const next = tf(existing);
      if (next && next !== existing) variants.add(next);
    }
  }
  return Array.from(variants).filter((x) => x && x !== raw);
}

function buildRobustnessMatrix() {
  const seeds = [
    makeCase('rb-read-tools', '工具列表', {
      intent: 'tool',
      actionCount: 0,
      guideIncludesAny: ['当前暂无可用工具', '当前可用工具共'],
      disallowGenericGuide: true,
    }),
    makeCase('rb-tool-access', '工具 kctl 谁可以用？', {
      intent: 'tool',
      actionCount: 0,
      guideIncludesAny: ['工具 kctl 当前可用角色共', '工具 kctl 当前未绑定任何角色'],
      disallowGenericGuide: true,
    }),
    makeCase('rb-register-missing-name', '注册一个 kubectl 工具吧', {
      intent: 'tool',
      actionCount: 0,
      guideIncludesAll: ['缺少工具名', 'executor=kubectl'],
      disallowGenericGuide: true,
    }),
    makeCase('rb-register-complete', '注册工具 kctl executor=kubectl', {
      intent: 'tool',
      actionCountMin: 1,
      firstActionType: 'tool.register',
    }),
    makeCase('rb-delete-complete', '删除 kubectl 工具', {
      intent: 'tool',
      actionCountMin: 1,
      firstActionType: 'tool.delete',
    }),
    makeCase('rb-delete-missing-name', '这两个工具重复了，删除一个', {
      intent: 'tool',
      actionCount: 0,
      guideIncludesAll: ['请先明确要删除哪一个', '删除工具 <name>'],
      disallowGenericGuide: true,
    }),
    makeCase('rb-role-bind', '角色 admin 绑定工具 query_metrics', {
      intent: 'role',
      actionCountMin: 1,
      firstActionType: 'role.bind',
    }),
  ];

  const out = [];
  for (const seed of seeds) {
    out.push(seed);
    const variants = applyRobustnessTransforms(seed.input).slice(0, 6);
    let idx = 0;
    for (const v of variants) {
      idx += 1;
      out.push(makeCase(`${seed.id}-v${idx}`, v, seed.expect));
    }
  }
  return out;
}

function buildExpandedMatrix(seedMatrix) {
  const expanded = Array.isArray(seedMatrix) ? [...seedMatrix] : [];
  const executors = ['mcp', 'skill', 'script', 'shell', 'kubectl'];
  const toolNames = ['kctl', 'ops_tool', 'deployer'];

  for (const executor of executors) {
    for (const toolName of toolNames) {
      expanded.push(
        makeCase(`mx-tool-complete-1-${executor}-${toolName}`, `注册工具 ${toolName} executor=${executor}`, {
          intent: 'tool',
          actionCountMin: 1,
          firstActionType: 'tool.register',
        }),
        makeCase(`mx-tool-complete-2-${executor}-${toolName}`, `新增工具 ${toolName} 执行器 ${executor}`, {
          intent: 'tool',
          actionCountMin: 1,
          firstActionType: 'tool.register',
        }),
        makeCase(`mx-tool-complete-3-${executor}-${toolName}`, `注册一个 ${toolName} ${executor} 工具`, {
          intent: 'tool',
          actionCountMin: 1,
          firstActionType: 'tool.register',
        })
      );
    }
  }

  for (const executor of executors) {
    expanded.push(
      makeCase(`mx-tool-missing-name-1-${executor}`, `注册一个 ${executor} 工具`, {
        intent: 'tool',
        actionCount: 0,
        guideIncludesAll: ['缺少工具名', `executor=${executor}`],
        disallowGenericGuide: true,
      }),
      makeCase(`mx-tool-missing-name-2-${executor}`, `帮我新增 ${executor} 工具`, {
        intent: 'tool',
        actionCount: 0,
        guideIncludesAll: ['缺少工具名', `executor=${executor}`],
        disallowGenericGuide: true,
      })
    );
  }

  for (const toolName of toolNames) {
    expanded.push(
      makeCase(`mx-tool-missing-exec-1-${toolName}`, `注册工具 ${toolName}`, {
        intent: 'tool',
        actionCount: 0,
        guideIncludesAll: ['缺少执行器类型', 'executor=<mcp|skill|script|shell|kubectl>'],
        disallowGenericGuide: true,
      }),
      makeCase(`mx-tool-missing-exec-2-${toolName}`, `新增工具 ${toolName}`, {
        intent: 'tool',
        actionCount: 0,
        guideIncludesAll: ['缺少执行器类型', 'executor=<mcp|skill|script|shell|kubectl>'],
        disallowGenericGuide: true,
      })
    );
  }

  const roleCases = [
    ['mx-role-bind-1', '角色 admin 绑定工具 query_metrics,query_alerts', 'role.bind'],
    ['mx-role-bind-2', 'role=admin bind_tools=query_metrics,query_alerts', 'role.bind'],
    ['mx-role-unbind-1', '角色 admin 解绑工具 query_metrics', 'role.unbind'],
    ['mx-role-unbind-2', '角色 admin 移除 工具 query_alerts', 'role.unbind'],
    ['mx-role-unbind-3', 'role=admin unbind_tools=query_alerts', 'role.unbind'],
    ['mx-role-bind-3', '角色admin绑定工具query_metrics', 'role.bind'],
  ];
  for (const [id, input, action] of roleCases) {
    expanded.push(makeCase(id, input, {
      intent: 'role',
      actionCountMin: 1,
      firstActionType: action,
    }));
  }

  const userCases = [
    ['mx-user-assign-1', '给用户 shamcleren 分配角色 admin', 'user.assign-role'],
    ['mx-user-remove-1', '用户 shamcleren 移除角色 admin', 'user.remove-role'],
    ['mx-user-assign-2', 'user=shamcleren assign_role=admin', 'user.assign-role'],
    ['mx-user-remove-2', 'user=shamcleren remove_role=admin', 'user.remove-role'],
    ['mx-user-biz-1', '设置用户 shamcleren 默认业务 100147', 'user.business-context.set'],
    ['mx-user-biz-2', 'user=shamcleren default_business_id=100147', 'user.business-context.set'],
  ];
  for (const [id, input, action] of userCases) {
    expanded.push(makeCase(id, input, {
      actionCountMin: 1,
      firstActionType: action,
    }));
  }

  const tokenAndReadCases = [
    makeCase('mx-token-overview-1', '查看 token 使用概览', {
      intent: 'token',
      actionCount: 0,
      guideIncludesAll: ['Token 使用概览'],
      disallowGenericGuide: true,
    }),
    makeCase('mx-token-overview-2', '查看 token 概览', {
      intent: 'token',
      actionCount: 0,
      guideIncludesAll: ['Token 使用概览'],
      disallowGenericGuide: true,
    }),
    makeCase('mx-token-trend-1', '查看 token 趋势', {
      intent: 'token',
      actionCount: 0,
      disallowGenericGuide: true,
    }),
    makeCase('mx-token-recent-1', '查看最近 token 用量', {
      intent: 'token',
      actionCount: 0,
      disallowGenericGuide: true,
    }),
    makeCase('mx-read-tools-1', '当前工具有什么？', {
      intent: 'tool',
      actionCount: 0,
      guideIncludesAny: ['当前暂无可用工具', '当前可用工具共'],
      disallowGenericGuide: true,
    }),
    makeCase('mx-read-models-1', '查看当前模型列表', {
      actionCount: 0,
      disallowGenericGuide: true,
    }),
    makeCase('mx-read-llm-stats-1', '查看LLM调用日志统计', {
      actionCount: 0,
      guideIncludesAll: ['LLM 调用统计'],
      disallowGenericGuide: true,
    }),
  ];
  expanded.push(...tokenAndReadCases);

  const mcpCases = [
    makeCase('mx-mcp-1', '注册 mcp id=tapd url=https://mcp.example.com/tapd/mcp/', {
      intent: 'mcp',
      actionCountMin: 1,
      firstActionType: 'mcp.server.register',
    }),
    makeCase('mx-mcp-2', '注册 mcp id=demo url=http://127.0.0.1:3001', {
      intent: 'mcp',
      actionCountMin: 1,
      firstActionType: 'mcp.server.register',
    }),
    makeCase('mx-mcp-3', '{"mcpServers":{"tapd":{"url":"https://mcp.example.com/tapd/mcp/"}}}', {
      intent: 'mcp',
      actionCountMin: 1,
      firstActionType: 'mcp.server.register',
    }),
  ];
  expanded.push(...mcpCases);

  const multiActionCases = [
    makeCase('mx-multi-1', '执行模式切换为 advice-only; 开启自动路由', { actionCountMin: 2 }),
    makeCase('mx-multi-2', 'role=admin bind_tools=query_metrics; role=admin unbind_tools=query_metrics', { actionCountMin: 2 }),
    makeCase('mx-multi-3', '注册工具 kctl executor=kubectl; 用户 shamcleren 移除角色 admin', { actionCountMin: 2 }),
  ];
  expanded.push(...multiActionCases);
  expanded.push(...buildRobustnessMatrix());

  const unique = [];
  const seen = new Set();
  for (const row of expanded) {
    const key = `${row.id}@@${row.input}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

function formatMarkdownReport(summary) {
  const lines = [];
  lines.push('# ChatOps Parse API 回放矩阵报告');
  lines.push('');
  lines.push(`- 时间: ${summary.timestamp}`);
  lines.push(`- BASE_URL: ${summary.baseUrl}`);
  lines.push(`- 矩阵文件: ${summary.matrixFile}`);
  lines.push(`- 总用例: ${summary.totalCases}`);
  lines.push(`- 失败用例: ${summary.failedCases}`);
  lines.push(`- 结论: ${summary.summary}`);
  lines.push('');
  lines.push('## 失败分层统计');
  lines.push('');
  for (const [layer, rows] of Object.entries(summary.failureLayers)) {
    lines.push(`- ${layer}: ${rows.length}`);
  }
  lines.push('');
  lines.push('## 失败明细');
  lines.push('');
  if (!summary.failures.length) {
    lines.push('- 无');
  } else {
    for (const f of summary.failures) {
      lines.push(`- [${f.caseId}] (${f.layer}/${f.check}) ${f.message}`);
    }
  }
  lines.push('');
  lines.push('## 用例详情（截断前 30 条）');
  lines.push('');
  for (const row of summary.details.slice(0, 30)) {
    lines.push(`- ${row.id}: status=${row.status}, intent=${row.intent}, actionCount=${row.actionCount}, firstAction=${row.firstActionType || '(none)'}`);
  }
  return `${lines.join('\n')}\n`;
}

async function callParse(input) {
  const res = await fetch(`${BASE_URL}/api/admin/chatops/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({ input }),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, ok: res.ok, body: json };
}

async function main() {
  const seedMatrix = JSON.parse(fs.readFileSync(MATRIX_FILE, 'utf8'));
  const matrix = buildExpandedMatrix(seedMatrix);
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error(`invalid matrix file: ${MATRIX_FILE}`);
  }
  if (matrix.length < 50) {
    throw new Error(`matrix too small: expected >= 50, got ${matrix.length}`);
  }

  const failures = [];
  const failureLayers = {
    [FAILURE_LAYER.API_CONTRACT]: [],
    [FAILURE_LAYER.INTENT_ROUTING]: [],
    [FAILURE_LAYER.ACTION_EXTRACTION]: [],
    [FAILURE_LAYER.GUIDE_FALLBACK]: [],
  };
  const details = [];
  for (const row of matrix) {
    const id = row.id || 'unknown';
    const input = String(row.input || '');
    const exp = row.expect || {};
    const result = await callParse(input);
    const data = result.body && result.body.data ? result.body.data : {};
    const actions = Array.isArray(data.actions) ? data.actions : [];
    const guide = String(data.guide || '');
    const intent = String(data.intent || '');

    assertCase(id, result.ok, FAILURE_LAYER.API_CONTRACT, 'http-status', `HTTP not ok: status=${result.status}`, failures, failureLayers);
    assertCase(
      id,
      result.body && result.body.success === true,
      FAILURE_LAYER.API_CONTRACT,
      'response-success',
      'response.success != true',
      failures,
      failureLayers
    );

    if (typeof exp.intent === 'string') {
      assertCase(
        id,
        intent === exp.intent,
        FAILURE_LAYER.INTENT_ROUTING,
        'intent',
        `intent mismatch: expected=${exp.intent} actual=${intent}`,
        failures,
        failureLayers
      );
    }
    if (typeof exp.actionCount === 'number') {
      assertCase(
        id,
        actions.length === exp.actionCount,
        FAILURE_LAYER.ACTION_EXTRACTION,
        'action-count',
        `actionCount mismatch: expected=${exp.actionCount} actual=${actions.length}`,
        failures,
        failureLayers
      );
    }
    if (typeof exp.actionCountMin === 'number') {
      assertCase(
        id,
        actions.length >= exp.actionCountMin,
        FAILURE_LAYER.ACTION_EXTRACTION,
        'action-count-min',
        `actionCountMin mismatch: expected>=${exp.actionCountMin} actual=${actions.length}`,
        failures,
        failureLayers
      );
    }
    if (typeof exp.firstActionType === 'string') {
      const firstType = actions[0] && actions[0].type ? String(actions[0].type) : '';
      assertCase(
        id,
        firstType === exp.firstActionType,
        FAILURE_LAYER.ACTION_EXTRACTION,
        'first-action-type',
        `firstActionType mismatch: expected=${exp.firstActionType} actual=${firstType || '(empty)'}`,
        failures,
        failureLayers
      );
    }
    if (Array.isArray(exp.guideIncludesAll)) {
      for (const token of exp.guideIncludesAll) {
        assertCase(
          id,
          guide.includes(String(token)),
          FAILURE_LAYER.GUIDE_FALLBACK,
          'guide-contains-all',
          `guide missing token: ${token}`,
          failures,
          failureLayers
        );
      }
    }
    if (Array.isArray(exp.guideIncludesAny) && exp.guideIncludesAny.length > 0) {
      const okAny = exp.guideIncludesAny.some((token) => guide.includes(String(token)));
      assertCase(
        id,
        okAny,
        FAILURE_LAYER.GUIDE_FALLBACK,
        'guide-contains-any',
        `guide misses all alternatives: ${exp.guideIncludesAny.join(' | ')}`,
        failures,
        failureLayers
      );
    }
    if (exp.disallowGenericGuide === true) {
      assertCase(
        id,
        !guide.includes('我没完全识别你的管理意图'),
        FAILURE_LAYER.GUIDE_FALLBACK,
        'guide-no-generic-fallback',
        'fell back to generic guide',
        failures,
        failureLayers
      );
    }

    details.push({
      id,
      status: result.status,
      intent,
      actionCount: actions.length,
      firstActionType: actions[0] && actions[0].type ? actions[0].type : null,
    });
  }

  const summary = {
    summary: failures.length === 0 ? 'PASS' : 'FAILED',
    baseUrl: BASE_URL,
    matrixFile: path.relative(process.cwd(), MATRIX_FILE),
    totalCases: matrix.length,
    failedCases: failures.length,
    failureLayers,
    failures,
    details,
    timestamp: new Date().toISOString(),
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const reportJson = path.join(REPORT_DIR, `CHATOPS-PARSE-MATRIX-${ts}.JSON`);
  const reportMd = path.join(REPORT_DIR, `CHATOPS-PARSE-MATRIX-${ts}.MD`);
  fs.writeFileSync(reportJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportMd, formatMarkdownReport(summary), 'utf8');

  console.log(JSON.stringify(summary, null, 2));
  console.log(`report_json=${reportJson}`);
  console.log(`report_md=${reportMd}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
