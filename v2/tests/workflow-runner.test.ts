import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildWorkflowCommandPlan, buildWorkflowDisplayPlan } from '../eval/workflow/actions';
import { formatWorkflowSummary } from '../eval/workflow/presenter';
import {
  applyWorkflowActionOutcome,
  buildWorkflowJsonPayload,
  writeWorkflowStatusReport,
} from '../eval/runners/workflow';
import type { WorkflowAction, WorkflowStateReport } from '../eval/workflow/types';

function buildReport(overrides: Partial<WorkflowStateReport> = {}): WorkflowStateReport {
  return {
    timestamp: '2026-03-30T15:40:00.000Z',
    state: 'status_refresh_needed',
    reason: 'derived status views are stale compared with the current workspace state',
    currentFocus: 'workflow orchestrator 落地',
    dirtyHotspots: ['M README.MD'],
    requiredActions: ['刷新 readiness 状态页', '写回 workflow 最新状态'],
    recommendedCommand: 'npm run workflow:refresh',
    lastVerifiedAt: '2026-03-30T14:10:00.000Z',
    lastStatusRefreshAt: '2026-03-30T14:12:00.000Z',
    artifacts: {
      handoffPath: 'docs/verification/HANDOFF-LATEST.MD',
      readinessPath: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContextPath: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      workflowStatusPath: 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json',
      comparePath: 'v2/eval/reports/COMPARE-LATEST.json',
      replayPath: 'eval/reports/REPLAY-LATEST.json',
      handoffFresh: false,
      readinessFresh: false,
      workflowFresh: false,
    },
    derivedFrom: {
      todo: 'TODO.MD',
      git: 'git status --short',
      handoff: 'docs/verification/HANDOFF-LATEST.MD',
      readiness: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
    },
    ...overrides,
  };
}

test('buildWorkflowCommandPlan 为 verify 返回底层 core verify 脚本', () => {
  const commands = buildWorkflowCommandPlan('verify', buildReport({
    state: 'verification_needed',
    recommendedCommand: 'npm run workflow:verify',
  }));
  assert.deepEqual(commands, ['bash scripts/test/verify-v2-core.sh']);
});

test('buildWorkflowCommandPlan 为 refresh 返回底层 readiness 刷新脚本', () => {
  const commands = buildWorkflowCommandPlan('refresh', buildReport({
    state: 'status_refresh_needed',
    recommendedCommand: 'npm run workflow:refresh',
  }));
  assert.deepEqual(commands, ['bash scripts/test/report-v2-readiness.sh']);
});

test('buildWorkflowCommandPlan 为 handoff 在不同状态下返回最小底层计划', () => {
  const handoffReadyCommands = buildWorkflowCommandPlan('handoff', buildReport({
    state: 'handoff_ready',
    recommendedCommand: 'npm run workflow:handoff',
  }));
  const refreshThenHandoffCommands = buildWorkflowCommandPlan('handoff', buildReport({
    state: 'status_refresh_needed',
    recommendedCommand: 'npm run workflow:refresh',
  }));

  assert.deepEqual(handoffReadyCommands, ['./node_modules/.bin/tsx v2/eval/runners/project-context-status.ts']);
  assert.deepEqual(refreshThenHandoffCommands, ['bash scripts/test/report-v2-readiness.sh']);
});

test('buildWorkflowDisplayPlan 始终对外暴露 workflow 主入口而不是内部脚本', () => {
  assert.deepEqual(buildWorkflowDisplayPlan('check', []), []);
  assert.deepEqual(buildWorkflowDisplayPlan('verify', ['bash scripts/test/verify-v2-core.sh']), ['npm run workflow:verify']);
  assert.deepEqual(buildWorkflowDisplayPlan('refresh', ['bash scripts/test/report-v2-readiness.sh']), ['npm run workflow:refresh']);
  assert.deepEqual(buildWorkflowDisplayPlan('handoff', ['./node_modules/.bin/tsx v2/eval/runners/project-context-status.ts']), ['npm run workflow:handoff']);
});

test('buildWorkflowJsonPayload 对外 JSON 只暴露 workflow 主入口命令', () => {
  const payload = buildWorkflowJsonPayload({
    root: '/repo',
    latestPath: '/repo/v2/eval/reports/WORKFLOW-STATUS-LATEST.json',
    report: buildReport({
      state: 'verification_needed',
      recommendedCommand: 'npm run workflow:verify',
    }),
    action: 'verify',
    internalCommands: ['bash scripts/test/verify-v2-core.sh'],
  });

  assert.deepEqual(payload.commands, ['npm run workflow:verify']);
  assert.equal(payload.statusFile, 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json');
  assert.equal(payload.report.recommendedCommand, 'npm run workflow:verify');
});

test('workflow 公开帮助文案只推荐 workflow 主入口', () => {
  const runEvalScript = fs.readFileSync(path.join(process.cwd(), 'eval/run-eval.sh'), 'utf-8');
  const readinessRunner = fs.readFileSync(path.join(process.cwd(), 'v2/eval/runners/readiness-status.ts'), 'utf-8');

  assert.match(runEvalScript, /npm run workflow:verify/);
  assert.match(runEvalScript, /npm run workflow:refresh/);
  assert.match(runEvalScript, /npm run workflow:handoff/);
  assert.match(runEvalScript, /npm run runtime:compare/);
  assert.doesNotMatch(runEvalScript, /npm run runtime:verify:core/);
  assert.doesNotMatch(runEvalScript, /npm run runtime:status/);
  assert.doesNotMatch(runEvalScript, /npm run runtime:handoff/);

  assert.match(readinessRunner, /npm run workflow:refresh/);
  assert.doesNotMatch(readinessRunner, /npm run runtime:status/);
});

test('README 与公开文档入口保持 workflow-first 且默认镜像命令一致', () => {
  const readme = fs.readFileSync(path.join(process.cwd(), 'README.MD'), 'utf-8');
  const localGuide = fs.readFileSync(path.join(process.cwd(), 'LOCAL-DEV-GUIDE.MD'), 'utf-8');
  const verificationDoc = fs.readFileSync(path.join(process.cwd(), 'docs/verification/VERIFICATION.MD'), 'utf-8');
  const docsIndex = fs.readFileSync(path.join(process.cwd(), 'docs/DOCS-INDEX.MD'), 'utf-8');
  const cliReference = fs.readFileSync(path.join(process.cwd(), 'docs/tools/CLI-REFERENCE.MD'), 'utf-8');
  const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf-8');

  for (const content of [readme, localGuide, verificationDoc, docsIndex, cliReference]) {
    assert.match(content, /workflow:verify/);
    assert.match(content, /workflow:handoff/);
  }

  assert.match(readme, /主回归 gate[\s\S]*workflow:verify/);
  assert.match(localGuide, /推荐日常流程[\s\S]*workflow:verify[\s\S]*workflow:handoff/);
  assert.match(verificationDoc, /workflow:verify/);
  assert.match(verificationDoc, /workflow:refresh/);
  assert.match(docsIndex, /workflow:handoff/);
  assert.match(cliReference, /workflow:verify/);
  assert.match(cliReference, /workflow:refresh/);
  assert.match(cliReference, /workflow:handoff/);

  for (const content of [readme, localGuide, verificationDoc, docsIndex, cliReference, dockerfile]) {
    assert.doesNotMatch(content, /runtime:verify:core/);
    assert.doesNotMatch(content, /runtime:status/);
    assert.doesNotMatch(content, /runtime:handoff/);
  }

  assert.match(dockerfile, /CMD \["npm", "run", "workflow:handoff"\]/);
});

test('formatWorkflowSummary 输出唯一推荐下一步和原因', () => {
  const summary = formatWorkflowSummary(buildReport());
  assert.match(summary, /当前状态: status_refresh_needed/);
  assert.match(summary, /推荐命令: npm run workflow:refresh/);
  assert.match(summary, /原因: derived status views are stale/);
});

test('writeWorkflowStatusReport 会写 latest 与时间戳快照', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-report-'));
  const latestPath = writeWorkflowStatusReport(dir, buildReport());
  const latest = JSON.parse(fs.readFileSync(latestPath, 'utf-8')) as WorkflowStateReport;

  assert.equal(path.basename(latestPath), 'WORKFLOW-STATUS-LATEST.json');
  assert.equal(latest.state, 'status_refresh_needed');
  assert.ok(fs.readdirSync(dir).some((file) => /^WORKFLOW-STATUS-\d{8}T\d{6}Z\.json$/i.test(file)));
});

test('applyWorkflowActionOutcome 在 verify 成功后把状态推进到 status_refresh_needed', () => {
  const report = applyWorkflowActionOutcome('verify' as WorkflowAction, buildReport({
    state: 'verification_needed',
    reason: 'runtime or entrypoint changes were detected and minimal verify has not been confirmed yet',
    requiredActions: ['运行最小必要验证'],
    recommendedCommand: 'npm run workflow:verify',
    artifacts: {
      ...buildReport().artifacts,
      readinessFresh: false,
      workflowFresh: true,
    },
  }));

  assert.equal(report.state, 'status_refresh_needed');
  assert.equal(report.recommendedCommand, 'npm run workflow:refresh');
  assert.match(report.reason, /verify finished/i);
  assert.ok(report.requiredActions.includes('刷新 readiness 状态页'));
});

test('applyWorkflowActionOutcome 在 handoff 成功后把状态推进到 ready_to_develop', () => {
  const report = applyWorkflowActionOutcome('handoff' as WorkflowAction, buildReport({
    state: 'handoff_ready',
    reason: 'documentation-facing changes are classified and the workspace is ready to publish a fresh handoff snapshot',
    requiredActions: ['生成最新 handoff 快照'],
    recommendedCommand: 'npm run workflow:handoff',
    artifacts: {
      ...buildReport().artifacts,
      handoffFresh: true,
      readinessFresh: true,
      workflowFresh: true,
    },
  }));

  assert.equal(report.state, 'ready_to_develop');
  assert.equal(report.recommendedCommand, 'none');
  assert.match(report.reason, /published handoff snapshot/i);
  assert.equal(report.requiredActions.length, 0);
});
