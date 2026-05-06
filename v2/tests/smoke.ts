import assert from 'node:assert/strict';
import { createUnifyQueryRuntimeAdapter } from '../src/adapters';
import { bootstrapV2 } from '../src/app';

async function main(): Promise<void> {
  const adapter = createUnifyQueryRuntimeAdapter();
  const app = bootstrapV2({
    adapter,
    adapterContext: {
      userId: 'v2-smoke-user',
      businessId: 'bk-smoke',
    },
  });

  const requestEvidenceResult = await Promise.resolve(app.runTurn({
    message: '查下我的服务情况',
  }));
  assert.equal(requestEvidenceResult.mode, 'request_evidence');
  assert.equal(requestEvidenceResult.adapterName, 'unify-query');
  assert.equal(requestEvidenceResult.toolExecutions.length, 0);

  const adapterBridgeResult = await Promise.resolve(app.runTurn({
    message: 'demo-service 为什么异常',
    toolRequests: [
      {
        toolName: 'query_metrics_smoke',
        toolClass: 'unify_query',
        summary: '验证 unify_query adapter bridge 的最小可执行链路',
        params: { sample: true },
      },
    ],
  }));

  assert.equal(adapterBridgeResult.mode, 'continue_investigation');
  assert.equal(adapterBridgeResult.adapterName, 'unify-query');
  assert.equal(adapterBridgeResult.selectedToolClasses[0], 'unify_query');
  assert.equal(adapterBridgeResult.toolExecutions.length, 1);
  assert.equal(adapterBridgeResult.toolExecutions[0].toolName, 'query_metrics_smoke');
  assert.equal(adapterBridgeResult.toolExecutions[0].success, false);
  assert.match(String(adapterBridgeResult.toolExecutions[0].error || ''), /暂不支持工具/);
  assert.equal(adapterBridgeResult.blocker?.code, 'tool_error');
  assert.ok(adapterBridgeResult.evidence.some((item) => item.type === 'tool_failure'));

  console.log(JSON.stringify({
    summary: 'PASS',
    adapter: adapter.name,
    cases: [
      {
        id: 'request-evidence-path',
        mode: requestEvidenceResult.mode,
        toolExecutions: requestEvidenceResult.toolExecutions.length,
      },
      {
        id: 'adapter-bridge-path',
        mode: adapterBridgeResult.mode,
        blocker: adapterBridgeResult.blocker?.code || 'none',
        toolName: adapterBridgeResult.toolExecutions[0]?.toolName || 'none',
      },
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.stack || error.message : error));
  process.exit(1);
});
