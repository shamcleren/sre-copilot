import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContextMarkdown,
  buildHandoffMarkdown,
  buildSessionResume,
} from '../eval/runners/project-context-status';

function buildReport() {
  return {
    timestamp: '2026-03-31T06:30:00.000Z',
    mission: {
      northStar: '保持 `V2 主运行时 + baseline compare 观察层`',
      successDefinition: '让新 session 能沿同一目标继续推进',
      currentStage: 'V2 已接管主入口，进入替换后观测',
      acceptanceStatus: '验收通过',
    },
    readinessGates: {
      core: true,
      baseline: true,
      compare: true,
      full: true,
      canExpandGray: true,
      canPrepareMainRouteCut: true,
    },
    architectureInvariants: ['`workflow:*` 是主入口'],
    sourceOfTruth: {
      primaryFiles: [
        '`v2/eval/reports/WORKFLOW-STATUS-LATEST.json`',
        '`docs/verification/HANDOFF-LATEST.MD`',
      ],
      latestArtifacts: {
        readinessJson: 'v2/eval/reports/READINESS-LATEST.json',
        compareJson: 'v2/eval/reports/COMPARE-LATEST.json',
        replayJson: 'eval/reports/REPLAY-LATEST.json',
        contextJsonLatest: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      },
    },
    gitContext: {
      branchSummary: 'main',
      recentCommits: ['abc123 test commit'],
      dirtyFiles: [{ status: 'M', file: 'README.MD' }],
      hasUncommittedChanges: true,
    },
    activeWork: {
      currentFocus: 'workflow orchestrator 落地',
      openTodos: ['统一 handoff 口径'],
      dirtyFileHotspots: ['M README.MD'],
      pendingVerification: ['npm run runtime:verify:core'],
    },
    roadmap: {
      total: 1,
      checked: 1,
      pendingTopLevel: [],
    },
    risksAndBlockers: {
      highestRisk: 'handoff 文案与 workflow 主入口不一致',
      mainBlockers: [],
      missingExternalConditions: [],
      rootCauseForNotReplacing: [],
    },
    nextShortestPath: [
      '先运行 `npm run runtime:verify:core` 固化最小验证。',
      '再运行 `npm run runtime:status` 刷新 readiness。',
    ],
    sessionResume: {
      recommendedCommands: [],
      checklist: [],
      handoffPrompt: '',
    },
  };
}

test('buildSessionResume 优先返回 workflow 命令而不是 runtime 命令', () => {
  const sessionResume = buildSessionResume(buildReport());

  assert.deepEqual(sessionResume.recommendedCommands, [
    'npm run workflow:resume',
    'npm run workflow:verify',
    'npm run workflow:refresh',
    'npm run workflow:handoff',
  ]);
  assert.ok(sessionResume.checklist.some((item) => item.includes('npm run workflow:resume')));
  assert.ok(sessionResume.checklist.every((item) => !item.includes('npm run runtime:handoff')));
  assert.match(sessionResume.handoffPrompt, /npm run workflow:verify/);
  assert.match(sessionResume.handoffPrompt, /npm run workflow:refresh/);
  assert.doesNotMatch(sessionResume.handoffPrompt, /npm run runtime:verify:core/);
  assert.doesNotMatch(sessionResume.handoffPrompt, /npm run runtime:status/);
});

test('buildContextMarkdown 使用 workflow 作为默认续接与刷新入口', () => {
  const markdown = buildContextMarkdown(buildReport());

  assert.match(markdown, /默认接力入口.*npm run workflow:resume/);
  assert.match(markdown, /推荐刷新顺序.*npm run workflow:refresh.*npm run workflow:handoff/);
  assert.doesNotMatch(markdown, /npm run runtime:verify:core/);
  assert.doesNotMatch(markdown, /npm run runtime:status/);
  assert.doesNotMatch(markdown, /npm run runtime:handoff/);
});

test('buildHandoffMarkdown 使用 workflow 命令指导新 session', () => {
  const markdown = buildHandoffMarkdown(buildReport());

  assert.match(markdown, /刷新命令：`npm run workflow:handoff`/);
  assert.match(markdown, /先运行 `npm run workflow:resume`/);
  assert.doesNotMatch(markdown, /npm run runtime:handoff/);
  assert.doesNotMatch(markdown, /npm run runtime:verify:core/);
  assert.doesNotMatch(markdown, /npm run runtime:status/);
});
