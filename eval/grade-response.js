#!/usr/bin/env node

const fs = require('fs');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`无法解析 JSON: ${filePath}: ${error.message}`);
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueMatches(haystack, values) {
  const matched = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    if (haystack.includes(normalized)) {
      matched.push(String(value));
      seen.add(normalized);
    }
  }
  return matched;
}

function parseRuntime(rawResponse) {
  const chat = rawResponse.chat || rawResponse.data || rawResponse;
  const responseText = String(
    chat?.response || chat?.answer || chat?.message || chat?.reply || ''
  );
  const metadata = (chat && typeof chat.metadata === 'object' && chat.metadata) || {};
  const toolCalls = Array.isArray(metadata.toolCalls) ? metadata.toolCalls : [];
  const intentFrame = metadata.intentObservability?.intentFrame || {};
  const intentDecision = metadata.intentDecision || {};
  const capabilities = Array.isArray(intentDecision.capabilities)
    ? intentDecision.capabilities.map((item) => String(item))
    : [];
  const intentEvidence = Array.isArray(intentDecision.evidence)
    ? intentDecision.evidence.map((item) => String(item))
    : [];
  const toolHaystack = normalizeText(
    toolCalls
      .map((item) =>
        [
          item?.tool,
          item?.resultSummary,
          item?.error,
          ...(Array.isArray(item?.reasons) ? item.reasons : []),
        ]
          .filter(Boolean)
          .join(' ')
      )
      .join(' | ')
  );

  return {
    responseText,
    responseHaystack: normalizeText(responseText),
    metadata,
    intentHaystack: normalizeText([intentFrame.intent, ...intentEvidence].filter(Boolean).join(' | ')),
    capabilities,
    capabilityHaystack: capabilities.map((item) => normalizeText(item)),
    toolCalls,
    toolHaystack,
    stepCount: Number(metadata.stepCount || 0),
    processingTimeMs: Number(metadata.processingTime || 0),
    phase: String(metadata.phase || ''),
  };
}

function runCheck(check, runtime) {
  const checkType = String(check?.type || '');
  const values = Array.isArray(check?.values) ? check.values : [];
  const minHits = Math.max(1, Number(check?.min_hits || check?.min || 1));

  switch (checkType) {
    case 'response-any': {
      const matched = uniqueMatches(runtime.responseHaystack, values);
      const ratio = Math.min(1, matched.length / minHits);
      return {
        type: checkType,
        passed: matched.length >= minHits,
        ratio,
        matched,
        required: minHits,
      };
    }
    case 'response-all': {
      const matched = uniqueMatches(runtime.responseHaystack, values);
      const required = Math.max(1, values.length);
      const ratio = matched.length / required;
      return {
        type: checkType,
        passed: matched.length === values.length,
        ratio,
        matched,
        required,
      };
    }
    case 'response-none': {
      const matched = uniqueMatches(runtime.responseHaystack, values);
      return {
        type: checkType,
        passed: matched.length === 0,
        ratio: matched.length === 0 ? 1 : 0,
        matched,
        required: 0,
      };
    }
    case 'metadata-intent-any': {
      const matched = uniqueMatches(runtime.intentHaystack, values);
      return {
        type: checkType,
        passed: matched.length > 0,
        ratio: matched.length > 0 ? 1 : 0,
        matched,
        required: 1,
      };
    }
    case 'metadata-capability-any': {
      const matched = [];
      for (const value of values) {
        const normalized = normalizeText(value);
        if (!normalized) continue;
        if (runtime.capabilityHaystack.some((item) => item.includes(normalized))) {
          matched.push(String(value));
        }
      }
      return {
        type: checkType,
        passed: matched.length > 0,
        ratio: matched.length > 0 ? 1 : 0,
        matched,
        required: 1,
      };
    }
    case 'tool-min-calls': {
      const successOnly = Boolean(check?.success_only);
      const actual = successOnly
        ? runtime.toolCalls.filter((item) => item && item.success).length
        : runtime.toolCalls.length;
      const required = Math.max(1, Number(check?.min || 1));
      return {
        type: checkType,
        passed: actual >= required,
        ratio: Math.min(1, actual / required),
        matched: [`${actual}`],
        required,
      };
    }
    case 'tool-any': {
      const matched = uniqueMatches(runtime.toolHaystack, values);
      const ratio = Math.min(1, matched.length / minHits);
      return {
        type: checkType,
        passed: matched.length >= minHits,
        ratio,
        matched,
        required: minHits,
      };
    }
    case 'step-count-min': {
      const required = Math.max(1, Number(check?.min || 1));
      return {
        type: checkType,
        passed: runtime.stepCount >= required,
        ratio: Math.min(1, runtime.stepCount / required),
        matched: [`${runtime.stepCount}`],
        required,
      };
    }
    default:
      fail(`未知检查类型: ${checkType}`);
  }
}

function scoreDimension(name, dimensionConfig, runtime) {
  const checks = Array.isArray(dimensionConfig?.checks) ? dimensionConfig.checks : [];
  const weight = Number(dimensionConfig?.weight || 0);
  if (checks.length === 0) {
    return {
      name,
      weight,
      score: 0,
      ratio: 0,
      passed: false,
      checks: [],
    };
  }

  const checkResults = checks.map((item) => runCheck(item, runtime));
  const ratio =
    checkResults.reduce((sum, item) => sum + Number(item.ratio || 0), 0) / checkResults.length;

  return {
    name,
    weight,
    score: Math.round(weight * ratio),
    ratio: Number(ratio.toFixed(4)),
    passed: checkResults.every((item) => item.passed),
    checks: checkResults,
  };
}

function summarizeFailures(dimensions) {
  const failures = [];
  for (const [name, item] of Object.entries(dimensions)) {
    for (const check of item.checks || []) {
      if (check.passed) continue;
      failures.push({
        dimension: name,
        type: check.type,
        matched: check.matched,
        required: check.required,
      });
    }
  }
  return failures;
}

function grade(caseData, runtime, defaultThreshold) {
  const expected = caseData.expected || {};
  const dimensions = {};
  let scoreTotal = 0;
  let scoreAchieved = 0;

  for (const dimensionName of ['intent', 'task_flow', 'interaction', 'tools', 'conclusion']) {
    const result = scoreDimension(dimensionName, expected[dimensionName], runtime);
    dimensions[dimensionName] = result;
    scoreTotal += result.weight;
    scoreAchieved += result.score;
  }

  const passThreshold = Number(caseData.pass_threshold_pct || defaultThreshold || 70);
  const scorePct = scoreTotal > 0 ? Math.round((scoreAchieved / scoreTotal) * 100) : 0;

  return {
    case_id: caseData.id,
    title: caseData.title,
    passed: scorePct >= passThreshold,
    pass_threshold_pct: passThreshold,
    score_pct: scorePct,
    score_achieved: scoreAchieved,
    score_total: scoreTotal,
    dimensions,
    failure_checks: summarizeFailures(dimensions),
    runtime: {
      intent: runtime.metadata.intentObservability?.intentFrame?.intent || '',
      capabilities: runtime.capabilities,
      step_count: runtime.stepCount,
      tool_call_count: runtime.toolCalls.length,
      processing_time_ms: runtime.processingTimeMs,
      phase: runtime.phase,
    },
    response_preview: runtime.responseText.slice(0, 600),
  };
}

function runSelfTest() {
  const sampleCase = {
    id: 'SELF-TEST',
    title: 'self test',
    expected: {
      intent: {
        weight: 15,
        checks: [{ type: 'metadata-intent-any', values: ['troubleshoot'] }],
      },
      task_flow: {
        weight: 25,
        checks: [
          { type: 'response-any', values: ['时间范围', '数据源'], min_hits: 2 },
          { type: 'step-count-min', min: 2 },
        ],
      },
      interaction: {
        weight: 20,
        checks: [{ type: 'response-any', values: ['请提供仪表盘链接'], min_hits: 1 }],
      },
      tools: {
        weight: 15,
        checks: [
          { type: 'tool-min-calls', min: 1 },
          { type: 'tool-any', values: ['query_metrics'], min_hits: 1 },
        ],
      },
      conclusion: {
        weight: 25,
        checks: [{ type: 'response-any', values: ['数据源关联错误', '修正配置'], min_hits: 2 }],
      },
    },
  };

  const sampleRuntime = parseRuntime({
    chat: {
      response:
        '先确认时间范围和数据源，请提供仪表盘链接。当前结论偏向数据源关联错误，建议修正配置后再验证。',
      metadata: {
        processingTime: 1234,
        stepCount: 3,
        phase: 'COMPLETE',
        toolCalls: [{ tool: 'query_metrics', success: true }],
        intentObservability: { intentFrame: { intent: 'troubleshoot' } },
        intentDecision: {
          capabilities: ['monitoring', 'logs'],
          evidence: ['intent=troubleshoot'],
        },
      },
    },
  });

  const result = grade(sampleCase, sampleRuntime, 70);
  if (!result.passed || result.score_pct < 90) {
    fail(`grader self-test failed: ${JSON.stringify(result, null, 2)}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

if (process.argv.length < 4) {
  fail('用法: node grade-response.js <case-json> <response-json> [default-threshold]');
}

const caseData = readJson(process.argv[2]);
const rawResponse = readJson(process.argv[3]);
const defaultThreshold = Number(process.argv[4] || 70);
const runtime = parseRuntime(rawResponse);

console.log(JSON.stringify(grade(caseData, runtime, defaultThreshold), null, 2));
