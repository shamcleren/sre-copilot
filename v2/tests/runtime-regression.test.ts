import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createUnifyQueryRuntimeAdapter, type RuntimeAdapter } from '../src/adapters';
import type { ReplayCase, ReplaySuite } from '../src/contracts';
import { executeCase } from '../src/runtime';
import { judgeReplayCase } from '../eval/judges/contract-judges';
import {
  buildAcceptanceStatus,
  contractHardeningReady,
  pureV2BaselineReady,
  runtimePhaseCoverageReady,
  strictCompareReady,
  v2RouteRuntimeReady,
} from '../eval/runners/readiness-status';
import {
  collaborativeNoToolSatisfied,
  firstToolClassesAligned,
  preferredFirstToolSatisfied,
} from '../eval/runners/compare-v1-v2';
import { validateReplaySuite } from '../eval/runners/replay-runner';

const SUITE_PATH = path.resolve(process.cwd(), 'v2/eval/specs/replay/effect-tuning-all.v2.json');
const POSITIVE_SERVICE_STATUS_CASE_IDS = ['ET-A2', 'ET-A3', 'ET-A4'] as const;
const REGRESSION_CASE_IDS = ['ET-B1', 'ET-C1', 'ET-C4', 'ET-D1', 'ET-D4', 'ET-E1', 'ET-E2', 'ET-E3', 'ET-E4', 'ET-E5'] as const;

function loadSuite(): ReplaySuite {
  return validateReplaySuite(JSON.parse(fs.readFileSync(SUITE_PATH, 'utf-8')), SUITE_PATH);
}

function getReplayCase(id: string): ReplayCase {
  const replayCase = loadSuite().cases.find((item) => item.id === id);
  assert.ok(replayCase, `missing replay case: ${id}`);
  return replayCase;
}

function runCase(id: string) {
  const replayCase = getReplayCase(id);
  const runtime = executeCase(replayCase.input);
  const judged = judgeReplayCase(replayCase, runtime);
  return { replayCase, runtime, judged };
}

function formatFailedChecks(id: string, judged: ReturnType<typeof runCase>['judged']): string {
  const failedChecks = judged.checks
    .filter((item) => !item.pass)
    .map((item) => `[${item.layer}] ${item.name}: ${item.detail}`);

  return `${id} failed checks:\n${failedChecks.join('\n')}`;
}

test('historical regression cases satisfy their replay contracts', () => {
  for (const id of REGRESSION_CASE_IDS) {
    const { judged } = runCase(id);
    assert.equal(judged.status, 'PASS', formatFailedChecks(id, judged));
  }
});

test('service-status seed cases continue investigation when service target is already explicit', () => {
  for (const id of POSITIVE_SERVICE_STATUS_CASE_IDS) {
    const { runtime, judged } = runCase(id);
    assert.equal(judged.status, 'PASS', formatFailedChecks(id, judged));
    assert.equal(runtime.mode, 'continue_investigation');
    assert.equal(runtime.selectedToolClasses[0], 'unify_query');
    assert.ok(runtime.evidence.some((item) => item.type === 'service_resolution'));
    assert.ok(runtime.evidence.some((item) => item.type === 'runtime_signal'));
    assert.doesNotMatch(runtime.conclusion.reply, /补充|提供.*服务名|提供.*Pod|提供.*域名/);
  }
});

test('business-context service status first resolves ownership before telemetry', () => {
  const runtime = executeCase({
    message: '帮我看下服务情况',
    context: { business: '火影忍者' },
  });

  assert.equal(runtime.mode, 'continue_investigation');
  assert.equal(runtime.turnModel.targetResolutionSource, 'business_context');
  assert.equal(runtime.turnModel.validationFocus, 'entity_resolution');
  assert.equal(runtime.selectedToolClasses[0], 'relation');
  assert.equal(runtime.selectedToolClasses[1], 'unify_query');
  assert.match(runtime.plan[1]?.summary || '', /解析业务上下文归属/);
  assert.match(runtime.conclusion.reply, /解析归属 service/);
  assert.match(runtime.conclusion.reply, /telemetry-first/);
});

test('business-context no-data cases still verify query correctness before relation fallback', () => {
  const runtime = executeCase({
    message: '火影忍者仪表盘没数据',
    context: { business: '火影忍者' },
  });

  assert.equal(runtime.mode, 'continue_investigation');
  assert.equal(runtime.turnModel.targetResolutionSource, 'business_context');
  assert.equal(runtime.turnModel.validationFocus, 'query_correctness');
  assert.equal(runtime.selectedToolClasses[0], 'unify_query');
  assert.ok(runtime.selectedToolClasses.includes('relation'));
  assert.match(runtime.plan[1]?.summary || '', /时间范围|查询条件|数据源|指标/);
  assert.match(runtime.conclusion.reply, /先证伪|先验证/);
  assert.match(runtime.conclusion.reply, /不能直接当成最终结论/);
});

test('symptom-seed cases route into telemetry-first investigation', () => {
  const b1 = runCase('ET-B1');
  assert.equal(b1.runtime.mode, 'continue_investigation');
  assert.equal(b1.runtime.selectedToolClasses[0], 'unify_query');
  assert.match(b1.runtime.conclusion.reply, /时间范围/);
  assert.match(b1.runtime.conclusion.reply, /查询/);
  assert.match(b1.runtime.conclusion.reply, /数据源/);
  assert.match(b1.runtime.conclusion.reply, /指标/);
  assert.match(b1.runtime.conclusion.reply, /先证伪|先验证/);
  assert.match(b1.runtime.conclusion.reply, /不能直接当成最终结论|不应直接下最终结论/);

  const c1 = runCase('ET-C1');
  assert.equal(c1.runtime.mode, 'continue_investigation');
  assert.equal(c1.runtime.selectedToolClasses[0], 'unify_query');
  assert.match(c1.runtime.conclusion.reply, /在线人数/);
  assert.match(c1.runtime.conclusion.reply, /序列/);
  assert.match(c1.runtime.conclusion.reply, /先要证伪|先确认/);
  assert.match(c1.runtime.conclusion.reply, /采集异常|业务真实波动/);

  const c4 = runCase('ET-C4');
  assert.equal(c4.runtime.mode, 'continue_investigation');
  assert.equal(c4.runtime.selectedToolClasses[0], 'unify_query');
  assert.ok(c4.runtime.selectedToolClasses.includes('knowledge'));
  assert.ok(!c4.runtime.selectedToolClasses.includes('k8s'));
  assert.ok(!c4.runtime.selectedToolClasses.includes('ssh'));
  assert.match(c4.runtime.conclusion.reply, /InitTempDir/i);
  assert.match(c4.runtime.conclusion.reply, /TEMP/i);
  assert.match(c4.runtime.conclusion.reply, /权限/);
});

test('relation and trace cases keep the intended first hop', () => {
  const d1 = runCase('ET-D1');
  assert.equal(d1.runtime.mode, 'continue_investigation');
  assert.equal(d1.runtime.selectedToolClasses[0], 'relation');
  assert.match(d1.runtime.conclusion.reply, /Service/);
  assert.match(d1.runtime.conclusion.reply, /Deployment/);

  const d4 = runCase('ET-D4');
  assert.equal(d4.runtime.mode, 'continue_investigation');
  assert.equal(d4.runtime.selectedToolClasses[0], 'unify_query');
  assert.ok(d4.runtime.selectedToolClasses.includes('relation'));
  assert.match(d4.runtime.conclusion.reply, /trace/i);
  assert.match(d4.runtime.conclusion.reply, /service/i);
  assert.match(d4.runtime.conclusion.reply, /pod/i);
});

test('weak-evidence cases stay collaborative instead of expanding into manuals', () => {
  const e1 = runCase('ET-E1');
  assert.equal(e1.runtime.mode, 'collaborative_request');
  assert.deepEqual(e1.runtime.selectedToolClasses, []);
  assert.ok(e1.runtime.evidence.some((item) => item.type === 'gap'));
  assert.match(e1.runtime.conclusion.reply, /补充|提供|确认/);
  assert.ok(e1.runtime.conclusion.reply.length < 600);

  const e2 = runCase('ET-E2');
  assert.equal(e2.runtime.mode, 'collaborative_request');
  assert.deepEqual(e2.runtime.selectedToolClasses, []);
  assert.ok(e2.runtime.evidence.some((item) => item.type === 'gap'));
  assert.match(e2.runtime.conclusion.reply, /时间范围/);
  assert.match(e2.runtime.conclusion.reply, /查询条件/);
  assert.match(e2.runtime.conclusion.reply, /数据源/);
  assert.match(e2.runtime.conclusion.reply, /指标/);
  assert.match(e2.runtime.conclusion.reply, /PromQL|图表链接/);
  assert.ok(e2.runtime.conclusion.reply.length < 700);

  const e3 = runCase('ET-E3');
  assert.equal(e3.runtime.mode, 'collaborative_request');
  assert.deepEqual(e3.runtime.selectedToolClasses, []);
  assert.ok(e3.runtime.evidence.some((item) => item.type === 'gap'));
  assert.equal(e3.runtime.turnModel.validationFocus, 'runtime_failure');
  assert.match(e3.runtime.conclusion.reply, /启动失败|配置异常/);
  assert.match(e3.runtime.conclusion.reply, /实例名/);
  assert.match(e3.runtime.conclusion.reply, /启动报错/);
  assert.match(e3.runtime.conclusion.reply, /发布|配置变更/);
  assert.doesNotMatch(e3.runtime.conclusion.reply, /不上报/);
  assert.ok(e3.runtime.conclusion.reply.length < 700);

  const e4 = runCase('ET-E4');
  assert.equal(e4.runtime.mode, 'collaborative_request');
  assert.deepEqual(e4.runtime.selectedToolClasses, []);
  assert.ok(e4.runtime.evidence.some((item) => item.type === 'gap'));
  assert.match(e4.runtime.conclusion.reply, /服务名|服务/);
  assert.match(e4.runtime.conclusion.reply, /错误日志|日志|超时/);
  assert.ok(e4.runtime.conclusion.reply.length < 600);

  const e5 = runCase('ET-E5');
  assert.equal(e5.runtime.mode, 'collaborative_request');
  assert.deepEqual(e5.runtime.selectedToolClasses, []);
  assert.ok(e5.runtime.evidence.some((item) => item.type === 'gap'));
  assert.equal(e5.runtime.turnModel.validationFocus, 'symptom_truth');
  assert.match(e5.runtime.conclusion.reply, /在线人数/);
  assert.match(e5.runtime.conclusion.reply, /业务真实下降|业务真实波动/);
  assert.match(e5.runtime.conclusion.reply, /采集异常/);
  assert.match(e5.runtime.conclusion.reply, /服务名/);
  assert.match(e5.runtime.conclusion.reply, /时间范围/);
  assert.match(e5.runtime.conclusion.reply, /在线人数样本/);
  assert.match(e5.runtime.conclusion.reply, /相邻指标|仪表盘|截图/);
  assert.ok(e5.runtime.conclusion.reply.length < 700);
});

test('executeCase can consume adapter results and append tool evidence', async () => {
  const adapter: RuntimeAdapter = {
    name: 'mock-success',
    description: '用于测试成功执行的 mock adapter',
    async execute(toolCall) {
      return {
        toolName: toolCall.toolName,
        toolClass: toolCall.toolClass ?? 'unify_query',
        summary: toolCall.summary,
        params: toolCall.params ?? {},
        success: true,
        data: { series: [{ metric: 'demo' }] },
        durationMs: 5,
      };
    },
  };

  const runtime = await executeCase(
    {
      message: 'demo-service 为什么异常',
      toolRequests: [
        {
          toolName: 'query_metrics',
          params: {
            startTime: '1710000000',
            endTime: '1710003600',
            queryList: [{ metric: 'demo.metric' }],
          },
        },
      ],
    },
    { adapter },
  );

  assert.equal(runtime.adapterName, 'mock-success');
  assert.equal(runtime.toolExecutions.length, 1);
  assert.equal(runtime.toolExecutions[0].toolName, 'query_metrics');
  assert.equal(runtime.blocker, undefined);
  assert.ok(runtime.evidence.some((item) => item.type === 'tool_result'));
  assert.match(runtime.conclusion.reply, /已确认事实/);
});

test('executeCase normalizes adapter failures into continue-investigation blockers', async () => {
  const adapter: RuntimeAdapter = {
    name: 'mock-timeout',
    description: '用于测试失败归一的 mock adapter',
    async execute(toolCall) {
      return {
        toolName: toolCall.toolName,
        toolClass: toolCall.toolClass ?? 'unify_query',
        summary: toolCall.summary,
        params: toolCall.params ?? {},
        success: false,
        error: 'request timeout',
        blockerCode: 'tool_timeout',
        durationMs: 20,
      };
    },
  };

  const runtime = await executeCase(
    {
      message: 'demo-service 为什么异常',
      toolRequests: [{ toolName: 'query_metrics', params: { metric: 'demo.metric' } }],
    },
    { adapter },
  );

  assert.equal(runtime.adapterName, 'mock-timeout');
  assert.equal(runtime.blocker?.code, 'tool_timeout');
  assert.equal(runtime.toolExecutions.length, 1);
  assert.ok(runtime.evidence.some((item) => item.type === 'tool_failure'));
  assert.match(runtime.conclusion.reply, /超时|阻塞点/);
});

test('executeCase surfaces permission blockers with explicit next action', async () => {
  const adapter: RuntimeAdapter = {
    name: 'mock-permission-denied',
    description: '用于测试权限阻塞归一的 mock adapter',
    async execute(toolCall) {
      return {
        toolName: toolCall.toolName,
        toolClass: toolCall.toolClass ?? 'unify_query',
        summary: toolCall.summary,
        params: toolCall.params ?? {},
        success: false,
        error: 'forbidden',
        blockerCode: 'permission_denied',
        durationMs: 12,
      };
    },
  };

  const runtime = await executeCase(
    {
      message: 'demo-service 为什么异常',
      toolRequests: [{ toolName: 'query_metrics', params: { metric: 'demo.metric' } }],
    },
    { adapter },
  );

  assert.equal(runtime.adapterName, 'mock-permission-denied');
  assert.equal(runtime.blocker?.code, 'permission_denied');
  assert.equal(runtime.toolExecutions.length, 1);
  assert.ok(runtime.evidence.some((item) => item.type === 'tool_failure'));
  assert.match(runtime.conclusion.reply, /权限不足|申请或切换到具备权限/);
});

test('unify-query runtime adapter uses adapterContext config for metrics requests', async () => {
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ series: [] }),
    } as Response;
  }) as typeof fetch;

  try {
    const adapter = createUnifyQueryRuntimeAdapter();
    const execution = await adapter.execute(
      {
        toolName: 'query_metrics',
        params: {
          businessId: '2',
          queryList: [{
            data_source: 'bkmonitor',
            table_id: 'system.cpu_summary',
            field_name: 'usage',
            reference_name: 'a',
            conditions: { field_list: [], condition_list: [] },
          }],
          metricMerge: 'a',
          startTime: '1716946204',
          endTime: '1716946906',
          step: '60s',
        },
      },
      {
        adapterContext: {
          userId: 'alice',
          businessId: '2',
          unifyQueryConfig: {
            baseUrl: 'https://bkapi.example.com/unify-query',
            headers: {
              Authorization: 'Bearer mock-token',
            },
            spaceUidTemplate: 'bkcc__{businessId}',
          },
        },
      },
    );

    assert.equal(execution.success, true);
    assert.equal(execution.status, 200);
    assert.equal(execution.toolClass, 'unify_query');
    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.equal(url, 'https://bkapi.example.com/unify-query/query/ts');
    assert.equal(init?.method, 'POST');
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers['X-Bk-Scope-Space-Uid'], 'bkcc__2');
    assert.equal(headers['Bk-Query-Source'], 'sre-copilot:alice');
    assert.equal(headers.Authorization, 'Bearer mock-token');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.space_uid, 'bkcc__2');
    assert.equal(body.query_list[0].table_id, 'system.cpu_summary');
  } finally {
    global.fetch = originalFetch;
  }
});

test('unify-query runtime adapter keeps relation space uid in headers and respects explicit querySource', async () => {
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ trace_id: 'trace-1', data: [] }),
    } as Response;
  }) as typeof fetch;

  try {
    const adapter = createUnifyQueryRuntimeAdapter();
    const execution = await adapter.execute(
      {
        toolName: 'query_relation_multi_resource',
        params: {
          businessId: '2',
          querySource: 'manual-regression',
          timestamp: 1716946204,
          sourceType: 'pod',
          sourceInfo: {
            namespace: 'prod',
            pod: 'web-0',
          },
          pathResource: ['service', 'deployment'],
          targetInfoShow: true,
        },
      },
      {
        adapterContext: {
          userId: 'alice',
          businessId: '2',
          unifyQueryConfig: {
            baseUrl: 'https://bkapi.example.com/unify-query',
            headers: {
              Authorization: 'Bearer mock-token',
            },
            spaceUidTemplate: 'bkcc__{businessId}',
          },
        },
      },
    );

    assert.equal(execution.success, true);
    assert.equal(calls.length, 1);
    const [{ url, init }] = calls;
    assert.equal(url, 'https://bkapi.example.com/unify-query/relation/multi_resource_query');
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers['X-Bk-Scope-Space-Uid'], 'bkcc__2');
    assert.equal(headers['Bk-Query-Source'], 'manual-regression');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.space_uid, undefined);
    assert.deepEqual(body.query_list[0], {
      timestamp: 1716946204,
      source_type: 'pod',
      source_info: {
        namespace: 'prod',
        pod: 'web-0',
      },
      target_info_show: true,
      path_resource: ['service', 'deployment'],
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('judgeReplayCase enforces blocker, conclusion, and tool execution contracts', async () => {
  const adapter: RuntimeAdapter = {
    name: 'mock-permission-denied',
    description: '用于测试 replay contract 硬化的 mock adapter',
    async execute(toolCall) {
      return {
        toolName: toolCall.toolName,
        toolClass: toolCall.toolClass ?? 'unify_query',
        summary: toolCall.summary,
        params: toolCall.params ?? {},
        success: false,
        error: 'forbidden',
        blockerCode: 'permission_denied',
        durationMs: 12,
      };
    },
  };

  const replayCase: ReplayCase = {
    id: 'contract-hardening-permission-denied',
    title: '权限阻塞 contract 应被显式校验',
    input: {
      message: 'demo-service 为什么异常',
      toolRequests: [{ toolName: 'query_metrics', params: { metric: 'demo.metric' } }],
    },
    intent_contract: {
      expected_mode: 'continue_investigation',
    },
    blocker_contract: {
      expect_present: true,
      expected_code: 'permission_denied',
      expected_retryable: false,
      expected_tool_name: 'query_metrics',
    },
    conclusion_contract: {
      summary_must_contain_keywords: ['权限不足'],
      next_actions_must_contain_keywords: ['申请或切换到具备权限'],
      hypotheses_must_contain_keywords: ['首跳工具'],
      confirmed_facts_must_contain_keywords: ['服务线索'],
    },
    tool_execution_contract: {
      expected_adapter: 'mock-permission-denied',
      min_calls: 1,
      required_tool_names: ['query_metrics'],
      required_blocker_codes: ['permission_denied'],
      must_have_success: false,
      must_have_failure: true,
      require_duration_ms: true,
    },
  };

  const runtime = await executeCase(replayCase.input, { adapter });
  const judged = judgeReplayCase(replayCase, runtime);

  assert.equal(judged.status, 'PASS', formatFailedChecks(replayCase.id, judged));
  assert.ok(judged.checks.some((item) => item.layer === 'blocker'));
  assert.ok(judged.checks.some((item) => item.layer === 'conclusion'));
  assert.ok(judged.checks.some((item) => item.layer === 'tool_execution'));
});

test('validateReplaySuite rejects invalid blocker contracts', () => {
  const invalidSuite = {
    version: '2.0',
    cases: [
      {
        id: 'invalid-blocker-contract',
        title: 'invalid blocker contract',
        input: { message: 'demo' },
        blocker_contract: {
          expected_code: 'not-a-real-blocker',
        },
      },
    ],
  };

  assert.throws(
    () => validateReplaySuite(invalidSuite, 'invalid-suite'),
    /expected_code contains unsupported value/,
  );
});

test('readiness gate helpers require shared compare cases, full phase coverage, and independent contract signals', () => {
  const compareReady = {
    summary: {
      total: 1,
      sharedCases: 1,
      improved: 0,
      regressed: 0,
      parityPass: 1,
      parityFail: 0,
      v1Missing: 0,
      modeAligned: 1,
      firstToolAligned: 1,
    },
  } as NonNullable<Parameters<typeof strictCompareReady>[0]>;
  const compareNoShared = {
    summary: {
      ...compareReady.summary,
      sharedCases: 0,
      parityPass: 0,
    },
  } as NonNullable<Parameters<typeof strictCompareReady>[0]>;
  const replayPass = {
    summary: 'PASS',
    timestamp: '2026-03-19T00:00:00.000Z',
    casesFile: 'demo.json',
    total: 1,
    passed: 1,
    failed: 0,
  } as Parameters<typeof buildAcceptanceStatus>[0]['replay'];
  const onlyFinalCutPending = [{ text: '满足门槛后执行最终切换', checked: false, indent: 0 }];
  const migrationStillPending = [{ text: '持续迁移 `V1` 经验到 `V2` 的 `playbooks / policies / contracts`', checked: false, indent: 0 }];
  const readinessRoadmapReady = [
    { text: '将 `V2` 接入灰度主入口：完成 `/api/chat` 与 `/api/chat/stream` 的默认切换', checked: true, indent: 0 },
    { text: '灰度入口已补齐可回滚机制与运行态标识：保留 fallbackToV1 与 observability 元数据', checked: true, indent: 0 },
    { text: '建立 `V2` 真实场景验收矩阵：覆盖主入口、工具执行、协作补材料、权限阻塞、回滚路径', checked: true, indent: 0 },
    { text: '扩展 `V2` adapter 合同：已补齐工具调用、观测结果、标准化 evidence/blocker 映射，不再只保留 `name / description`', checked: true, indent: 2 },
    { text: '为 adapter 失败语义做统一归一：已覆盖空结果、超时、鉴权失败、权限阻塞等 blocker 映射，并回写 `evidence / blocker / conclusion`', checked: true, indent: 2 },
    { text: '明确替换门槛：已新增 `docs/verification/V2-READINESS-CHECKLIST.MD` 与 `npm run v2:status` / `make v2-readiness-status`，固定关键真实 case、`V1 / V2` compare、灰度回滚与 readiness 状态判据', checked: true, indent: 0 },
  ];
  const readinessRoadmapMissingRoute = readinessRoadmapReady.filter((item) => !item.text.includes('灰度入口已补齐可回滚机制与运行态标识'));
  const runtimeObservabilityReady = { performanceReady: true } as Parameters<typeof pureV2BaselineReady>[0]['runtimeObservability'];
  const runtimeObservabilityMissing = { performanceReady: false } as Parameters<typeof pureV2BaselineReady>[0]['runtimeObservability'];

  assert.equal(strictCompareReady(compareReady), true);
  assert.equal(strictCompareReady(compareNoShared), false);
  assert.equal(
    buildAcceptanceStatus({
      coreVerifyPassed: true,
      replay: replayPass,
      pendingTopLevel: onlyFinalCutPending,
    }),
    '已具备验收条件',
  );
  assert.equal(
    buildAcceptanceStatus({
      coreVerifyPassed: true,
      replay: replayPass,
      pendingTopLevel: migrationStillPending,
    }),
    '进行中',
  );
  assert.equal(
    buildAcceptanceStatus({
      coreVerifyPassed: false,
      replay: replayPass,
      pendingTopLevel: [],
    }),
    '验收失败/阻塞',
  );
  assert.equal(
    pureV2BaselineReady({
      coreVerifyPassed: true,
      replay: replayPass,
      roadmapItems: readinessRoadmapReady,
      runtimeObservability: runtimeObservabilityReady,
    }),
    true,
  );
  assert.equal(
    pureV2BaselineReady({
      coreVerifyPassed: true,
      replay: replayPass,
      roadmapItems: readinessRoadmapMissingRoute,
      runtimeObservability: runtimeObservabilityReady,
    }),
    false,
  );
  assert.equal(
    pureV2BaselineReady({
      coreVerifyPassed: true,
      replay: replayPass,
      roadmapItems: readinessRoadmapReady,
      runtimeObservability: runtimeObservabilityMissing,
    }),
    false,
  );

  assert.equal(
    runtimePhaseCoverageReady({
      phaseViews: [
        { phase: 'intentInference', label: '意图识别', llmCalls: 0, requestCount: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0, maxLatencyMs: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, avgPromptChars: 0, avgSystemPromptChars: 0, avgUserPromptChars: 0, maxPromptChars: 0, topModel: '未采集' },
        { phase: 'toolPlanning', label: '工具规划', llmCalls: 1, requestCount: 1, successCalls: 1, errorCalls: 0, avgLatencyMs: 10, maxLatencyMs: 10, promptTokens: 4, completionTokens: 6, totalTokens: 10, avgPromptChars: 10, avgSystemPromptChars: 4, avgUserPromptChars: 6, maxPromptChars: 10, topModel: 'demo' },
        { phase: 'replyGeneration', label: '回答生成', llmCalls: 1, requestCount: 1, successCalls: 1, errorCalls: 0, avgLatencyMs: 12, maxLatencyMs: 12, promptTokens: 5, completionTokens: 7, totalTokens: 12, avgPromptChars: 12, avgSystemPromptChars: 5, avgUserPromptChars: 7, maxPromptChars: 12, topModel: 'demo' },
      ],
      toolStats: { totalCalls: 2, successCalls: 2, errorCalls: 0, avgLatencyMs: 20, topTools: [], todayCalls: 0 },
      toolBreakdown: [],
    }),
    false,
  );
  assert.equal(
    runtimePhaseCoverageReady({
      phaseViews: [
        { phase: 'intentInference', label: '意图识别', llmCalls: 1, requestCount: 1, successCalls: 1, errorCalls: 0, avgLatencyMs: 8, maxLatencyMs: 8, promptTokens: 3, completionTokens: 5, totalTokens: 8, avgPromptChars: 8, avgSystemPromptChars: 3, avgUserPromptChars: 5, maxPromptChars: 8, topModel: 'demo' },
        { phase: 'toolPlanning', label: '工具规划', llmCalls: 1, requestCount: 1, successCalls: 1, errorCalls: 0, avgLatencyMs: 10, maxLatencyMs: 10, promptTokens: 4, completionTokens: 6, totalTokens: 10, avgPromptChars: 10, avgSystemPromptChars: 4, avgUserPromptChars: 6, maxPromptChars: 10, topModel: 'demo' },
        { phase: 'replyGeneration', label: '回答生成', llmCalls: 1, requestCount: 1, successCalls: 1, errorCalls: 0, avgLatencyMs: 12, maxLatencyMs: 12, promptTokens: 5, completionTokens: 7, totalTokens: 12, avgPromptChars: 12, avgSystemPromptChars: 5, avgUserPromptChars: 7, maxPromptChars: 12, topModel: 'demo' },
      ],
      toolStats: { totalCalls: 2, successCalls: 2, errorCalls: 0, avgLatencyMs: 20, topTools: [], todayCalls: 0 },
      toolBreakdown: [],
    }),
    true,
  );
  assert.equal(
    v2RouteRuntimeReady({
      totalAttempts: 1,
      handledV2Count: 1,
      intentPhaseSamples: 1,
      intentLlmEnabledSamples: 0,
      v2RuntimeSamples: 1,
      toolExecutionSamples: 1,
    }),
    false,
  );
  assert.equal(
    v2RouteRuntimeReady({
      totalAttempts: 2,
      handledV2Count: 1,
      intentPhaseSamples: 2,
      intentLlmEnabledSamples: 1,
      v2RuntimeSamples: 1,
      toolExecutionSamples: 1,
    }),
    true,
  );

  assert.equal(
    contractHardeningReady({
      roadmapItems: [
        { text: '扩展 `V2` adapter 合同：已补齐工具调用、观测结果、标准化 evidence/blocker 映射，不再只保留 `name / description`', checked: true, indent: 2 },
        { text: '为 adapter 失败语义做统一归一：已覆盖空结果、超时、鉴权失败、权限阻塞等 blocker 映射，并回写 `evidence / blocker / conclusion`', checked: true, indent: 2 },
        { text: '明确替换门槛：已新增 `docs/verification/V2-READINESS-CHECKLIST.MD` 与 `npm run v2:status` / `make v2-readiness-status`，固定关键真实 case、`V1 / V2` compare、灰度回滚与 readiness 状态判据', checked: true, indent: 0 },
        { text: '持续迁移 `V1` 经验到 `V2` 的 `playbooks / policies / contracts`：新增场景默认补数据与契约，不再向 `V1` 主链路追加结构性分支', checked: false, indent: 0 },
      ],
      replay: replayPass,
    }),
    true,
  );

  assert.equal(firstToolClassesAligned('none', 'none'), true);
  assert.equal(firstToolClassesAligned('k8s', 'unify_query'), false);
  assert.equal(preferredFirstToolSatisfied('unify_query', ['unify_query']), true);
  assert.equal(preferredFirstToolSatisfied('k8s', ['unify_query']), false);
  assert.equal(preferredFirstToolSatisfied('none', ['unify_query']), false);
  assert.equal(collaborativeNoToolSatisfied('collaborative_request', 'none'), true);
  assert.equal(collaborativeNoToolSatisfied('collaborative_request', 'knowledge'), false);
  assert.equal(collaborativeNoToolSatisfied('continue_investigation', 'none'), false);
});
