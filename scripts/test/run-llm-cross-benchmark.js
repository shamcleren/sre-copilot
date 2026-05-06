#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '../..');
const CORPUS_FILE = path.join(ROOT_DIR, 'eval', 'corpus.json');
const REPORT_DIR = path.join(ROOT_DIR, 'docs', 'verification');
const DEFAULT_CASE_IDS = ['AUTO-001', 'AUTO-003', 'AUTO-008', 'AUTO-011', 'AUTO-013', 'AUTO-015'];

function readAuthToken() {
  if (process.env.AUTH_TOKEN && process.env.AUTH_TOKEN.trim()) {
    return process.env.AUTH_TOKEN.trim();
  }
  const tokenFile = path.join(ROOT_DIR, '.env.admin-token');
  if (!fs.existsSync(tokenFile)) return '';
  const content = fs.readFileSync(tokenFile, 'utf8');
  const match = content.match(/^AUTH_TOKEN=(.+)$/m);
  return match ? match[1].trim() : '';
}

function parseArgs(argv) {
  const args = {
    remoteHost: process.env.REMOTE_HOST || 'dev',
    remotePath: process.env.REMOTE_PATH || '/data/sre-copilot',
    remoteServicePort: Number(process.env.REMOTE_SERVICE_PORT || 3900),
    caseIds: [],
    limit: 0,
    bkAiModels: [],
    minimaxModels: [],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ids') {
      args.caseIds = String(argv[i + 1] || '').split(',').map((item) => item.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      args.limit = Number(argv[i + 1] || 0);
      i += 1;
      continue;
    }
    if (arg === '--bk-ai-models') {
      args.bkAiModels = String(argv[i + 1] || '').split(',').map((item) => item.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === '--minimax-models') {
      args.minimaxModels = String(argv[i + 1] || '').split(',').map((item) => item.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === '--remote-host') {
      args.remoteHost = String(argv[i + 1] || '').trim() || args.remoteHost;
      i += 1;
      continue;
    }
    if (arg === '--remote-path') {
      args.remotePath = String(argv[i + 1] || '').trim() || args.remotePath;
      i += 1;
      continue;
    }
    if (arg === '--remote-service-port') {
      args.remoteServicePort = Number(argv[i + 1] || args.remoteServicePort);
      i += 1;
      continue;
    }
  }
  return args;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function nowTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
  ].join('');
}

function buildSelectedCases(corpus, requestedIds, limit) {
  const allCases = Array.isArray(corpus.cases) ? corpus.cases : [];
  const selected = requestedIds.length
    ? allCases.filter((item) => requestedIds.includes(item.id))
    : allCases.filter((item) => DEFAULT_CASE_IDS.includes(item.id));
  if (limit > 0) return selected.slice(0, limit);
  return selected;
}

function runRemoteBenchmark({ remoteHost, remotePath, remoteServicePort, authToken, payload }) {
  const tokenQuoted = shellQuote(authToken);
  const payloadQuoted = shellQuote(JSON.stringify(payload));
  const inner = [
    `cd ${shellQuote(remotePath)}`,
    `TOKEN=${tokenQuoted}`,
    `kubectl port-forward -n sre-copilot svc/sre-copilot-service ${remoteServicePort}:80 >/tmp/sre-copilot-pf.log 2>&1 &`,
    'PF_PID=$!',
    'trap "kill $PF_PID >/dev/null 2>&1 || true" EXIT',
    'sleep 5',
    `curl -sS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -X POST http://127.0.0.1:${remoteServicePort}/api/admin/llm-cross-test --data ${payloadQuoted}`,
  ].join('\n');

  const output = execFileSync('ssh', [remoteHost, `/bin/bash -lc ${shellQuote(inner)}`], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function aggregateRuns(caseRuns) {
  const map = new Map();
  caseRuns.forEach((caseRun) => {
    (caseRun.results || []).forEach((item) => {
      const runtime = item.runtime || {};
      const key = `${item.provider || 'unknown'}::${runtime.model || item.explicitModel || '-'}`;
      if (!map.has(key)) {
        map.set(key, {
          provider: item.provider || 'unknown',
          model: runtime.model || item.explicitModel || '-',
          totalRuns: 0,
          successCount: 0,
          totalLatencyMs: 0,
          totalTokens: 0,
          maxLatencyMs: 0,
          sampleCaseIds: [],
          failures: [],
        });
      }
      const row = map.get(key);
      row.totalRuns += 1;
      if (item.success) {
        row.successCount += 1;
        row.totalLatencyMs += Number(item.latencyMs || 0);
        row.totalTokens += Number(item.tokensUsed || 0);
        row.maxLatencyMs = Math.max(row.maxLatencyMs, Number(item.latencyMs || 0));
      } else {
        row.failures.push({
          caseId: caseRun.case.id,
          error: item.error || 'unknown',
        });
      }
      if (row.sampleCaseIds.length < 5) {
        row.sampleCaseIds.push(caseRun.case.id);
      }
    });
  });

  return Array.from(map.values()).map((row) => ({
    ...row,
    successRate: row.totalRuns > 0 ? Number((row.successCount / row.totalRuns).toFixed(4)) : 0,
    avgLatencyMs: row.successCount > 0 ? Math.round(row.totalLatencyMs / row.successCount) : null,
    avgTokens: row.successCount > 0 ? Math.round(row.totalTokens / row.successCount) : null,
  })).sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate;
    return (a.avgLatencyMs || Number.MAX_SAFE_INTEGER) - (b.avgLatencyMs || Number.MAX_SAFE_INTEGER);
  });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# LLM 交叉测试默认 Benchmark 报告');
  lines.push('');
  lines.push('## 基线');
  lines.push('');
  lines.push(`- 时间：${report.generatedAt}`);
  lines.push(`- 语料：\`eval/corpus.json\``);
  lines.push(`- 用例数：${report.caseRuns.length}`);
  lines.push(`- 用例：${report.caseRuns.map((item) => `${item.case.id} ${item.case.title}`).join('；')}`);
  lines.push(`- bk_ai 模型：${report.request.modelMatrix.bk_ai.length ? report.request.modelMatrix.bk_ai.join(', ') : 'provider 默认'}`);
  lines.push(`- minimax 模型：${report.request.modelMatrix.minimax.length ? report.request.modelMatrix.minimax.join(', ') : 'provider 默认'}`);
  lines.push('');
  lines.push('## 聚合结果');
  lines.push('');
  lines.push('| Provider | Model | Success | Avg Latency(ms) | Avg Tokens | Max Latency(ms) |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: |');
  report.aggregate.forEach((row) => {
    lines.push(`| ${row.provider} | ${row.model} | ${row.successCount}/${row.totalRuns} | ${row.avgLatencyMs ?? '-'} | ${row.avgTokens ?? '-'} | ${row.maxLatencyMs || '-'} |`);
  });
  lines.push('');
  lines.push('## 用例明细');
  lines.push('');
  report.caseRuns.forEach((item) => {
    lines.push(`### ${item.case.id} ${item.case.title}`);
    lines.push('');
    lines.push(`- level: ${item.case.level}`);
    lines.push(`- category: ${item.case.category}`);
    lines.push(`- prompt: ${item.case.prompt}`);
    lines.push('');
    lines.push('| Provider | Model | Status | Latency(ms) | Tokens |');
    lines.push('| --- | --- | --- | ---: | ---: |');
    (item.results || []).forEach((result) => {
      const runtime = result.runtime || {};
      lines.push(`| ${result.provider || '-'} | ${runtime.model || result.explicitModel || '-'} | ${result.success ? 'success' : `failed: ${result.error || 'unknown'}`} | ${result.latencyMs ?? '-'} | ${result.tokensUsed ?? '-'} |`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const authToken = readAuthToken();
  if (!authToken) {
    throw new Error('缺少 AUTH_TOKEN（环境变量或 .env.admin-token）');
  }
  const corpus = JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8'));
  const cases = buildSelectedCases(corpus, args.caseIds, args.limit);
  if (!cases.length) {
    throw new Error('没有可执行的 benchmark case');
  }

  const requestConfig = {
    modelMatrix: {
      bk_ai: args.bkAiModels,
      minimax: args.minimaxModels,
    },
  };

  const caseRuns = [];
  cases.forEach((testCase, index) => {
    process.stdout.write(`[${index + 1}/${cases.length}] ${testCase.id} ${testCase.title}\n`);
    const response = runRemoteBenchmark({
      remoteHost: args.remoteHost,
      remotePath: args.remotePath,
      remoteServicePort: args.remoteServicePort,
      authToken,
      payload: {
        prompt: testCase.prompt,
        modelMatrix: requestConfig.modelMatrix,
      },
    });
    if (!response.success) {
      throw new Error(`benchmark 接口失败: ${response.error || 'unknown'}`);
    }
    caseRuns.push({
      case: {
        id: testCase.id,
        title: testCase.title,
        level: testCase.level,
        category: testCase.category,
        prompt: testCase.prompt,
      },
      results: (response.data && response.data.results) || [],
      benchmark: (response.data && response.data.benchmark) || {},
    });
  });

  const aggregate = aggregateRuns(caseRuns);
  const timestamp = nowTimestamp();
  const jsonFile = path.join(REPORT_DIR, `LLM-CROSS-BENCHMARK-${timestamp}.JSON`);
  const reportFile = path.join(REPORT_DIR, `LLM-CROSS-BENCHMARK-${timestamp}.MD`);
  const report = {
    generatedAt: new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }),
    request: requestConfig,
    cases: cases.map((item) => item.id),
    caseRuns,
    aggregate,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportFile, renderMarkdown(report));

  process.stdout.write(`REPORT_JSON=${jsonFile}\n`);
  process.stdout.write(`REPORT_MD=${reportFile}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
