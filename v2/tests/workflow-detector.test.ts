import assert from 'node:assert/strict';
import test from 'node:test';
import { detectWorkflowState } from '../eval/workflow/detector';
import { classifyDirtyFiles, summarizeWorkflowSources } from '../eval/workflow/source-snapshot';
import type { WorkflowReadinessSnapshot, WorkflowSourceSnapshot } from '../eval/workflow/types';

function buildReadiness(overrides: Partial<WorkflowReadinessSnapshot> = {}): WorkflowReadinessSnapshot {
  return {
    available: true,
    currentStage: 'V2 已接管主入口，进入替换后观测',
    acceptanceStatus: '验收通过',
    coreReady: true,
    baselineReady: true,
    compareReady: true,
    fullReady: true,
    latestVerifyFailed: false,
    needsStatusRefresh: false,
    lastVerifiedAt: '2026-03-30T14:10:00.000Z',
    lastStatusRefreshAt: '2026-03-30T14:12:00.000Z',
    ...overrides,
  };
}

function buildSnapshot(overrides: Partial<WorkflowSourceSnapshot> = {}): WorkflowSourceSnapshot {
  return {
    timestamp: '2026-03-30T15:30:00.000Z',
    currentFocus: 'workflow orchestrator 落地',
    openTodos: ['实现 workflow:check'],
    dirtyFiles: [],
    dirtyHotspots: [],
    dirtySummary: {
      hasRuntimeChanges: false,
      hasDocsChanges: false,
      hasUnknownChanges: false,
      unknownFiles: [],
    },
    latestArtifacts: {
      handoffPath: 'docs/verification/HANDOFF-LATEST.MD',
      readinessPath: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContextPath: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      workflowStatusPath: 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json',
      comparePath: 'v2/eval/reports/COMPARE-LATEST.json',
      replayPath: 'eval/reports/REPLAY-LATEST.json',
      handoffFresh: true,
      readinessFresh: true,
      workflowFresh: true,
    },
    readiness: buildReadiness(),
    previousWorkflow: null,
    ...overrides,
  };
}

test('detectWorkflowState 返回 verification_needed 当 runtime dirty 且未完成最小验证', () => {
  const report = detectWorkflowState(buildSnapshot({
    dirtyFiles: [{ status: 'M', file: 'v2/eval/runners/project-context-status.ts' }],
    dirtyHotspots: ['M v2/eval/runners/project-context-status.ts'],
    dirtySummary: {
      hasRuntimeChanges: true,
      hasDocsChanges: false,
      hasUnknownChanges: false,
      unknownFiles: [],
    },
    readiness: buildReadiness({
      currentStage: '进行中',
      acceptanceStatus: '进行中',
      coreReady: false,
      baselineReady: false,
      compareReady: true,
      fullReady: false,
    }),
  }));

  assert.equal(report.state, 'verification_needed');
  assert.equal(report.recommendedCommand, 'npm run workflow:verify');
  assert.match(report.reason, /minimal verify/i);
});

test('detectWorkflowState 返回 blocked 当最近验证失败', () => {
  const report = detectWorkflowState(buildSnapshot({
    readiness: buildReadiness({
      currentStage: '进行中',
      acceptanceStatus: '验收失败/阻塞',
      coreReady: false,
      baselineReady: false,
      compareReady: false,
      fullReady: false,
      latestVerifyFailed: true,
      needsStatusRefresh: true,
    }),
  }));

  assert.equal(report.state, 'blocked');
  assert.equal(report.recommendedCommand, 'npm run workflow:check');
  assert.ok(report.requiredActions.includes('修复最近一次验证失败'));
});

test('detectWorkflowState 返回 ready_to_develop 当现场干净且状态已最新', () => {
  const report = detectWorkflowState(buildSnapshot());

  assert.equal(report.state, 'ready_to_develop');
  assert.equal(report.recommendedCommand, 'none');
  assert.equal(report.requiredActions.length, 0);
});

test('detectWorkflowState 不会对同一批已验证的 runtime dirty 重复要求 verify', () => {
  const report = detectWorkflowState(buildSnapshot({
    dirtyFiles: [{ status: 'M', file: 'v2/eval/runners/project-context-status.ts' }],
    dirtyHotspots: ['M v2/eval/runners/project-context-status.ts'],
    dirtySummary: {
      hasRuntimeChanges: true,
      hasDocsChanges: false,
      hasUnknownChanges: false,
      unknownFiles: [],
    },
    latestArtifacts: {
      ...buildSnapshot().latestArtifacts,
      handoffFresh: false,
      readinessFresh: true,
      workflowFresh: true,
    },
    readiness: buildReadiness({
      currentStage: '进行中',
      acceptanceStatus: '进行中',
      coreReady: true,
      baselineReady: true,
      compareReady: true,
      fullReady: true,
    }),
    previousWorkflow: {
      timestamp: '2026-03-30T16:00:00.000Z',
      state: 'status_refresh_needed',
      reason: 'verify finished successfully, but derived status views still need refresh before the workflow can move forward',
      currentFocus: 'workflow orchestrator 落地',
      dirtyHotspots: ['M v2/eval/runners/project-context-status.ts'],
      requiredActions: ['刷新 readiness 状态页', '写回 workflow 最新状态'],
      recommendedCommand: 'npm run workflow:refresh',
      lastVerifiedAt: '2026-03-30T16:00:00.000Z',
      lastStatusRefreshAt: '2026-03-30T15:50:00.000Z',
      artifacts: buildSnapshot().latestArtifacts,
      derivedFrom: {
        todo: 'TODO.MD',
        git: 'git status --short',
        handoff: 'docs/verification/HANDOFF-LATEST.MD',
        readiness: 'docs/verification/V2-READINESS-STATUS.MD',
        projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      },
    },
  }));

  assert.notEqual(report.state, 'verification_needed');
  assert.equal(report.recommendedCommand, 'none');
});

test('detectWorkflowState 在同一批 docs dirty 已完成 handoff 后返回 ready_to_develop', () => {
  const report = detectWorkflowState(buildSnapshot({
    dirtyFiles: [{ status: 'M', file: 'README.MD' }],
    dirtyHotspots: ['M README.MD'],
    dirtySummary: {
      hasRuntimeChanges: false,
      hasDocsChanges: true,
      hasUnknownChanges: false,
      unknownFiles: [],
    },
    latestArtifacts: {
      ...buildSnapshot().latestArtifacts,
      handoffFresh: true,
      readinessFresh: true,
      workflowFresh: true,
    },
    previousWorkflow: {
      timestamp: '2026-03-30T16:20:00.000Z',
      state: 'ready_to_develop',
      reason: 'current workspace already has a published handoff snapshot',
      currentFocus: 'workflow orchestrator 落地',
      dirtyHotspots: ['M README.MD'],
      requiredActions: [],
      recommendedCommand: 'none',
      lastVerifiedAt: '2026-03-30T16:00:00.000Z',
      lastStatusRefreshAt: '2026-03-30T16:20:00.000Z',
      artifacts: {
        ...buildSnapshot().latestArtifacts,
        handoffFresh: true,
        readinessFresh: true,
        workflowFresh: true,
      },
      derivedFrom: {
        todo: 'TODO.MD',
        git: 'git status --short',
        handoff: 'docs/verification/HANDOFF-LATEST.MD',
        readiness: 'docs/verification/V2-READINESS-STATUS.MD',
        projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      },
    },
  }));

  assert.equal(report.state, 'ready_to_develop');
  assert.equal(report.recommendedCommand, 'none');
});

test('detectWorkflowState 在同一批混合 dirty 已 verify 且已 handoff 后保持 ready_to_develop', () => {
  const report = detectWorkflowState(buildSnapshot({
    dirtyFiles: [
      { status: 'M', file: 'README.MD' },
      { status: 'M', file: 'Makefile' },
    ],
    dirtyHotspots: ['M README.MD', 'M Makefile'],
    dirtySummary: {
      hasRuntimeChanges: true,
      hasDocsChanges: true,
      hasUnknownChanges: false,
      unknownFiles: [],
    },
    latestArtifacts: {
      ...buildSnapshot().latestArtifacts,
      handoffFresh: true,
      readinessFresh: true,
      workflowFresh: true,
    },
    previousWorkflow: {
      timestamp: '2026-03-30T16:30:00.000Z',
      state: 'ready_to_develop',
      reason: 'current workspace already has a published handoff snapshot',
      currentFocus: 'workflow orchestrator 落地',
      dirtyHotspots: ['M README.MD', 'M Makefile'],
      requiredActions: [],
      recommendedCommand: 'none',
      lastVerifiedAt: '2026-03-30T16:25:00.000Z',
      lastStatusRefreshAt: '2026-03-30T16:30:00.000Z',
      artifacts: {
        ...buildSnapshot().latestArtifacts,
        handoffFresh: true,
        readinessFresh: true,
        workflowFresh: true,
      },
      derivedFrom: {
        todo: 'TODO.MD',
        git: 'git status --short',
        handoff: 'docs/verification/HANDOFF-LATEST.MD',
        readiness: 'docs/verification/V2-READINESS-STATUS.MD',
        projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      },
    },
  }));

  assert.equal(report.state, 'ready_to_develop');
  assert.equal(report.recommendedCommand, 'none');
});

test('classifyDirtyFiles 能把 runtime、docs、unknown 变更分开', () => {
  const summary = classifyDirtyFiles([
    { status: 'M', file: 'v2/eval/runners/project-context-status.ts' },
    { status: 'M', file: 'README.MD' },
    { status: 'M', file: 'scripts/custom/manual.sh' },
  ]);

  assert.equal(summary.hasRuntimeChanges, true);
  assert.equal(summary.hasDocsChanges, true);
  assert.equal(summary.hasUnknownChanges, true);
  assert.deepEqual(summary.unknownFiles, ['scripts/custom/manual.sh']);
});

test('summarizeWorkflowSources 在缺少 workflow 状态文件时返回 workflowFresh=false', () => {
  const snapshot = summarizeWorkflowSources({
    root: process.cwd(),
    todoContent: '| 当前重点 | workflow |\n',
    dirtyFiles: [],
    readiness: buildReadiness({
      currentStage: '进行中',
      acceptanceStatus: '进行中',
      baselineReady: false,
      compareReady: false,
      fullReady: false,
    }),
    latestArtifacts: {
      handoffPath: 'docs/verification/HANDOFF-LATEST.MD',
      readinessPath: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContextPath: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      workflowStatusPath: '',
      comparePath: 'v2/eval/reports/COMPARE-LATEST.json',
      replayPath: 'eval/reports/REPLAY-LATEST.json',
      handoffFresh: true,
      readinessFresh: true,
      workflowFresh: false,
    },
  });

  assert.equal(snapshot.latestArtifacts.workflowFresh, false);
  assert.equal(snapshot.currentFocus, 'workflow');
});
