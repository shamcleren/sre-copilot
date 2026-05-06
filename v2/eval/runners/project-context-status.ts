import fs from 'fs';
import path from 'path';
import {
  buildPendingVerification,
  parseDirtyFiles,
  readJsonFile,
  relativePath,
  repoRoot,
  safeExec,
  summarizeWorkflowSources,
  timestampLabel,
  tryLatestFile,
  uniqueNonEmpty,
} from '../workflow/source-snapshot';

interface ReadinessReport {
  timestamp: string;
  overall: {
    currentStage: string;
    acceptanceStatus: string;
    canExpandGray: boolean;
    canPrepareMainRouteCut: boolean;
    verifyPassed: boolean;
    fullVerifyPassed?: boolean;
    coreVerifyPassed?: boolean;
    compareVerifyPassed?: boolean;
    compatVerifyPassed?: boolean;
    coreReady?: boolean;
    compareObservedReady?: boolean;
    compatReady?: boolean;
    v2BaselineReady?: boolean;
  };
  compareSummary: {
    total: number;
    sharedCases: number;
    improved: number;
    regressed: number;
    parityPass: number;
    parityFail: number;
  };
  replaySummary: {
    summary: string;
    total: number;
    passed: number;
    failed: number;
  };
  roadmap: {
    total: number;
    checked: number;
    pendingTopLevel: string[];
  };
  risksAndBlockers: {
    highestRisk: string;
    mainBlockers: string[];
    missingExternalConditions: string[];
    rootCauseForNotReplacing: string[];
  };
  nextShortestPath: string[];
  artifactPaths: {
    comparePath: string;
    replayPath: string;
  };
}

interface GitFileView {
  status: string;
  file: string;
}

interface ActiveWorkReport {
  currentFocus: string;
  openTodos: string[];
  dirtyFileHotspots: string[];
  pendingVerification: string[];
}

interface ProjectContextReport {
  timestamp: string;
  mission: {
    northStar: string;
    successDefinition: string;
    currentStage: string;
    acceptanceStatus: string;
  };
  readinessGates: {
    core: boolean;
    baseline: boolean;
    compare: boolean;
    full: boolean;
    canExpandGray: boolean;
    canPrepareMainRouteCut: boolean;
  };
  architectureInvariants: string[];
  sourceOfTruth: {
    primaryFiles: string[];
    latestArtifacts: {
      readinessJson: string;
      compareJson: string;
      replayJson: string;
      contextJsonLatest: string;
    };
  };
  gitContext: {
    branchSummary: string;
    recentCommits: string[];
    dirtyFiles: GitFileView[];
    hasUncommittedChanges: boolean;
  };
  activeWork: ActiveWorkReport;
  roadmap: ReadinessReport['roadmap'];
  risksAndBlockers: ReadinessReport['risksAndBlockers'];
  nextShortestPath: string[];
  sessionResume: {
    recommendedCommands: string[];
    checklist: string[];
    handoffPrompt: string;
  };
}

const SECTION_START = '<!-- PROJECT_CONTEXT:START -->';
const SECTION_END = '<!-- PROJECT_CONTEXT:END -->';

function describeArtifactPath(root: string, targetPath: string | null, fallbackLabel: string): string {
  return targetPath ? relativePath(root, targetPath) : fallbackLabel;
}

function yesNo(value: boolean): string {
  return value ? '是' : '否';
}

function passState(value: boolean): string {
  return value ? '通过' : '未通过';
}

function buildFallbackReadinessReport(root: string): ReadinessReport {
  const v2ReportsDir = path.join(root, 'v2/eval/reports');
  const evalReportsDir = path.join(root, 'eval/reports');
  const comparePath = tryLatestFile(v2ReportsDir, /^COMPARE-.*\.json$/i);
  const replayPath = tryLatestFile(evalReportsDir, /^REPLAY-.*\.json$/i);

  return {
    timestamp: new Date().toISOString(),
    overall: {
      currentStage: '待刷新 handoff / readiness 基线',
      acceptanceStatus: '尚未生成最新 readiness 报告',
      canExpandGray: false,
      canPrepareMainRouteCut: false,
      verifyPassed: false,
      fullVerifyPassed: false,
      coreVerifyPassed: false,
      compareVerifyPassed: false,
      coreReady: false,
      compareObservedReady: false,
      v2BaselineReady: false,
    },
    compareSummary: {
      total: 0,
      sharedCases: 0,
      improved: 0,
      regressed: 0,
      parityPass: 0,
      parityFail: 0,
    },
    replaySummary: {
      summary: '未生成最新 replay / readiness 产物',
      total: 0,
      passed: 0,
      failed: 0,
    },
    roadmap: {
      total: 0,
      checked: 0,
      pendingTopLevel: [],
    },
    risksAndBlockers: {
      highestRisk: '如果直接开新 session，容易在缺少最新 readiness 的情况下偏离当前仓库真实状态。',
      mainBlockers: ['先运行 `npm run workflow:refresh` 生成最新 readiness，再执行 `npm run workflow:handoff` 固化交接快照。'],
      missingExternalConditions: ['缺少最新 `READINESS-*.json` 产物。'],
      rootCauseForNotReplacing: ['handoff 缺少最新 readiness 基线，当前仅能基于 `TODO.MD` 与 Git 现场续接。'],
    },
    nextShortestPath: [
      '先运行 `npm run workflow:refresh` 刷新 readiness / compare / replay 汇总。',
      '再运行 `npm run workflow:handoff`，同步更新最新交接快照与上下文 JSON。',
      '最后把 `docs/verification/HANDOFF-LATEST.MD` 中的上下文粘贴给新 session。',
    ],
    artifactPaths: {
      comparePath: comparePath || '',
      replayPath: replayPath || '',
    },
  };
}

function buildActiveWorkReport(params: {
  workflowSource: ReturnType<typeof summarizeWorkflowSources>;
  dirtyFiles: GitFileView[];
}): ActiveWorkReport {
  const { workflowSource, dirtyFiles } = params;
  return {
    currentFocus: workflowSource.currentFocus,
    openTodos: workflowSource.openTodos,
    dirtyFileHotspots: workflowSource.dirtyHotspots.length > 0
      ? workflowSource.dirtyHotspots
      : ['无，当前工作区干净。'],
    pendingVerification: toWorkflowCommands(buildPendingVerification(workflowSource.dirtySummary, dirtyFiles)),
  };
}

function buildArchitectureInvariants(): string[] {
  return [
    '`v2/` 是当前主运行时与主验收资产，新的结构能力默认落在 `V2`。',
    '`v1/` 已完成退场删除，历史 replay baseline 保留在 `eval/` 供 compare 使用。',
    '`scripts/`、`docs/`、`eval/`、`package.json`、`Makefile` 属于跨版本公共层，继续保留在仓库顶层。',
    '跨 session 续接时，先看 readiness / handoff / TODO，再决定代码动作，避免脱离当前迁移目标。',
  ];
}

function toWorkflowCommands(commands: string[]): string[] {
  const mapped = commands.flatMap((command) => {
    if (command === 'npm run runtime:verify:core') {
      return ['npm run workflow:verify'];
    }
    if (command === 'npm run runtime:status') {
      return ['npm run workflow:refresh'];
    }
    if (command === 'npm run runtime:handoff') {
      return ['npm run workflow:handoff'];
    }
    return [];
  });

  return uniqueNonEmpty(mapped);
}

function replaceWorkflowCommandText(text: string): string {
  return text
    .replaceAll('npm run runtime:verify:core', 'npm run workflow:verify')
    .replaceAll('npm run runtime:status', 'npm run workflow:refresh')
    .replaceAll('npm run runtime:handoff', 'npm run workflow:handoff');
}

function toWorkflowNarratives(items: string[]): string[] {
  return uniqueNonEmpty(items.map((item) => replaceWorkflowCommandText(item)));
}

function firstWorkflowCommand(report: ProjectContextReport): string {
  return toWorkflowCommands(report.activeWork.pendingVerification)[0] || 'npm run workflow:resume';
}

export function buildSessionResume(report: ProjectContextReport): ProjectContextReport['sessionResume'] {
  const workflowPendingCommands = toWorkflowCommands(report.activeWork.pendingVerification);
  const workflowMainBlockers = toWorkflowNarratives(report.risksAndBlockers.mainBlockers);
  const workflowNextShortestPath = toWorkflowNarratives(report.nextShortestPath);
  const firstRecommendedCommand = firstWorkflowCommand(report);
  const checklist = [
    '先运行 `npm run workflow:resume`，再读 `docs/verification/HANDOFF-LATEST.MD`；如果刚切回仓库或不确定现场是否变化，再运行 `npm run workflow:handoff` 刷新。',
    '再看 `docs/verification/V2-READINESS-STATUS.MD` 的“总体状态 / 风险与阻塞”，确认当前 gate 与 readiness 结论。',
    `再核对 \`TODO.MD\` 与“当前活跃工作”：重点=${report.activeWork.currentFocus}；未完成活跃项=${report.activeWork.openTodos.length > 0 ? report.activeWork.openTodos.join('；') : '无'}`,
    `若准备接力编码，先跑建议验证命令中的第一条：${firstRecommendedCommand}`,
    '开始编码前，最后核对 `v2/eval/reports/PROJECT-CONTEXT-LATEST.json` 与最近 compare/replay 报告，避免架构漂移。',
  ];

  const handoffPrompt = [
    `当前仓库北极星是：${report.mission.northStar}`,
    `当前阶段：${report.mission.currentStage}；验收状态：${report.mission.acceptanceStatus}；gate：core=${passState(report.readinessGates.core)} / baseline=${passState(report.readinessGates.baseline)} / compare=${passState(report.readinessGates.compare)} / full=${passState(report.readinessGates.full)}；可继续扩大灰度=${yesNo(report.readinessGates.canExpandGray)}；可准备切主入口=${yesNo(report.readinessGates.canPrepareMainRouteCut)}。`,
    `当前重点：${report.activeWork.currentFocus}。`,
    `当前活跃未完成项：${report.activeWork.openTodos.length > 0 ? report.activeWork.openTodos.join('；') : '无'}`,
    `当前改动热点：${report.activeWork.dirtyFileHotspots.join('；')}`,
    `建议先做的验证：${workflowPendingCommands.length > 0 ? workflowPendingCommands.join('；') : 'npm run workflow:resume'}`,
    `必须遵守的架构不变量：${report.architectureInvariants.join('；')}`,
    `当前主要阻塞：${workflowMainBlockers.length > 0 ? workflowMainBlockers.join('；') : '无'}`,
    `优先按“下一步最短路径”推进：${workflowNextShortestPath.join('；')}`,
    '在没有新证据前，不要偏离 `V2 主运行时 + baseline compare 观察层` 的当前仓库口径。',
  ].join(' ');

  return {
    recommendedCommands: uniqueNonEmpty([
      'npm run workflow:resume',
      ...workflowPendingCommands,
      'npm run workflow:refresh',
      'npm run workflow:handoff',
    ]),
    checklist,
    handoffPrompt,
  };
}

export function buildContextMarkdown(report: ProjectContextReport): string {
  const dirtyFiles = report.gitContext.dirtyFiles.length > 0
    ? report.gitContext.dirtyFiles.slice(0, 12).map((item) => `- ${item.status} ${item.file}`)
    : ['- 无，当前工作区干净。'];
  const workflowNextShortestPath = toWorkflowNarratives(report.nextShortestPath);
  const firstRecommendedCommand = firstWorkflowCommand(report);

  return [
    SECTION_START,
    '## 工程级上下文 / Session 续接 / Handoff',
    '',
    '- **默认接力入口**: `npm run workflow:resume`（先读当前 workflow 状态，再按推荐动作推进）',
    '- **本页定位**: 负责展示 readiness / 风险 / replaceability 结论；不再重复展开完整 handoff 快照。',
    '- **推荐刷新顺序**: 先 `npm run workflow:refresh`（需要新 readiness 时），再 `npm run workflow:handoff` 固化最新接力快照。',
    '- **底层兼容入口**: 如需绕过编排层，可直接调用底层 runtime 命令；但它们不再作为流程主入口。',
    '',
    '### 当前接力摘要',
    '',
    `- **当前阶段**: ${report.mission.currentStage}`,
    `- **当前验收状态**: ${report.mission.acceptanceStatus}`,
    `- **当前重点**: ${report.activeWork.currentFocus}`,
    `- **最高风险**: ${report.risksAndBlockers.highestRisk}`,
    `- **下一步最短路径**: ${workflowNextShortestPath.length > 0 ? workflowNextShortestPath.join('；') : '无'}`,
    `- **建议先执行**: \`${firstRecommendedCommand}\``,
    '',
    '### Source of Truth',
    '',
    ...report.sourceOfTruth.primaryFiles.map((item) => `- ${item}`),
    '',
    `- **最新机读上下文**: \`${report.sourceOfTruth.latestArtifacts.contextJsonLatest}\``,
    `- **最新 readiness 报告**: \`${report.sourceOfTruth.latestArtifacts.readinessJson}\``,
    `- **最新 compare 报告**: \`${report.sourceOfTruth.latestArtifacts.compareJson}\``,
    `- **最新 replay 报告**: \`${report.sourceOfTruth.latestArtifacts.replayJson}\``,
    '',
    '### 当前改动热点',
    '',
    ...report.activeWork.dirtyFileHotspots.map((item) => `- ${item}`),
    '',
    '### 当前未提交项（节选）',
    '',
    ...dirtyFiles,
    '',
    '### 新 Session 标准顺序',
    '',
    '1. 先读 `docs/verification/HANDOFF-LATEST.MD`。',
    '2. 再看本页“总体状态 / 风险与阻塞”。',
    '3. 再核对 `TODO.MD` 与当前工作区变更。',
    `4. 开始编码前至少执行一次 \`${firstRecommendedCommand}\`，或在现场变化时先刷新 \`npm run workflow:handoff\`。`,
    '',
    SECTION_END,
  ].join('\n');
}

export function buildHandoffMarkdown(report: ProjectContextReport): string {
  const workflowMainBlockers = toWorkflowNarratives(report.risksAndBlockers.mainBlockers);
  const workflowNextShortestPath = toWorkflowNarratives(report.nextShortestPath);
  const firstRecommendedCommand = firstWorkflowCommand(report);

  return [
    '# HANDOFF LATEST',
    '',
    `> 自动生成时间：${report.timestamp}`,
    '> 刷新命令：`npm run workflow:handoff` / `make workflow-handoff`',
    '> 这是跨 session 续接的最新人类可读快照；如当前工作区有新改动，请先重新刷新。',
    '',
    '## 一眼结论',
    '',
    `- **当前阶段**: ${report.mission.currentStage}`,
    `- **当前验收状态**: ${report.mission.acceptanceStatus}`,
    `- **当前重点**: ${report.activeWork.currentFocus}`,
    `- **当前 gate 结论**: core=${passState(report.readinessGates.core)}；baseline=${passState(report.readinessGates.baseline)}；compare=${passState(report.readinessGates.compare)}；full=${passState(report.readinessGates.full)}`,
    `- **未提交改动**: ${report.gitContext.hasUncommittedChanges ? '有，接手前先看“当前改动热点”' : '无，工作区当前干净'}`,
    '',
    '## 接手顺序',
    '',
    '1. 先运行 `npm run workflow:resume`，读取当前 workflow 状态、原因与唯一推荐动作。',
    '2. 再看 `docs/verification/V2-READINESS-STATUS.MD` 的“总体状态 / 风险与阻塞”，确认当前 gate 与 readiness 结论。',
    '3. 再核对 `TODO.MD` 与下方“当前活跃工作”。',
    `4. 若准备继续编码，先执行 \`${firstRecommendedCommand}\`；如需要重建交接快照，再运行 \`npm run workflow:handoff\`。`,
    '',
    '## 当前活跃工作',
    '',
    `- **当前重点**: ${report.activeWork.currentFocus}`,
    `- **活跃未完成项**: ${report.activeWork.openTodos.length > 0 ? report.activeWork.openTodos.join('；') : '无'}`,
    `- **当前改动热点**: ${report.activeWork.dirtyFileHotspots.join('；')}`,
    '',
    '## 风险 / 阻塞 / 下一步',
    '',
    `- **最高风险**: ${report.risksAndBlockers.highestRisk}`,
    `- **主要阻塞**: ${workflowMainBlockers.length > 0 ? workflowMainBlockers.join('；') : '无'}`,
    `- **下一步最短路径**: ${workflowNextShortestPath.join('；')}`,
    '',
    '## 推荐命令',
    '',
    ...report.sessionResume.recommendedCommands.map((item) => `- \`${item}\``),
    '',
    '## Source of Truth',
    '',
    ...report.sourceOfTruth.primaryFiles.map((item) => `- ${item}`),
    `- **最新机读上下文**: \`${report.sourceOfTruth.latestArtifacts.contextJsonLatest}\``,
    `- **最新 readiness 报告**: \`${report.sourceOfTruth.latestArtifacts.readinessJson}\``,
    `- **最新 compare 报告**: \`${report.sourceOfTruth.latestArtifacts.compareJson}\``,
    `- **最新 replay 报告**: \`${report.sourceOfTruth.latestArtifacts.replayJson}\``,
    '',
    '## 建议直接粘贴给新 Session 的上下文',
    '',
    `> ${report.sessionResume.handoffPrompt}`,
    '',
  ].join('\n');
}

function upsertContextSection(existingMarkdown: string, contextMarkdown: string): string {
  if (existingMarkdown.includes(SECTION_START) && existingMarkdown.includes(SECTION_END)) {
    const start = existingMarkdown.indexOf(SECTION_START);
    const end = existingMarkdown.indexOf(SECTION_END);
    if (start >= 0 && end > start) {
      const afterEnd = end + SECTION_END.length;
      return `${existingMarkdown.slice(0, start).trimEnd()}\n\n${contextMarkdown}\n${existingMarkdown.slice(afterEnd).trimStart()}`.trimEnd() + '\n';
    }
  }
  return `${existingMarkdown.trimEnd()}\n\n${contextMarkdown}\n`;
}

function pruneHistoricalSnapshots(reportsDir: string, keepLatest: number): void {
  const historicalSnapshots = fs
    .readdirSync(reportsDir)
    .filter((file) => /^PROJECT-CONTEXT-\d{8}T\d{6}Z\.json$/i.test(file))
    .sort();

  const filesToRemove = historicalSnapshots.slice(0, Math.max(0, historicalSnapshots.length - keepLatest));
  for (const file of filesToRemove) {
    fs.rmSync(path.join(reportsDir, file), { force: true });
  }
}

async function main(): Promise<void> {
  const root = repoRoot();
  const reportsDir = path.join(root, 'v2/eval/reports');
  const readinessPath = tryLatestFile(reportsDir, /^READINESS-.*\.json$/i);
  const readiness = readinessPath
    ? readJsonFile<ReadinessReport>(readinessPath)
    : buildFallbackReadinessReport(root);
  const projectContextLatestPath = path.join(reportsDir, 'PROJECT-CONTEXT-LATEST.json');
  const projectContextTimestampPath = path.join(reportsDir, `PROJECT-CONTEXT-${timestampLabel()}.json`);
  const handoffMarkdownPath = path.join(root, 'docs/verification/HANDOFF-LATEST.MD');
  const todoContent = fs.readFileSync(path.join(root, 'TODO.MD'), 'utf-8');

  const branchSummary = (safeExec(root, 'git --no-pager status -sb --untracked-files=normal').split('\n')[0] || '未知').replace(/^##\s*/u, '');
  const recentCommits = safeExec(root, 'git --no-pager log --oneline -5').split('\n').filter(Boolean);
  const dirtyFiles = parseDirtyFiles(safeExec(root, 'git --no-pager status --short'));
  const workflowSource = summarizeWorkflowSources({
    root,
    todoContent,
    dirtyFiles,
    readiness: {
      available: Boolean(readinessPath),
      currentStage: readiness.overall.currentStage,
      acceptanceStatus: readiness.overall.acceptanceStatus,
      coreReady: Boolean(readiness.overall.coreReady ?? readiness.overall.verifyPassed),
      baselineReady: Boolean(readiness.overall.v2BaselineReady ?? readiness.overall.canExpandGray),
      compareReady: Boolean(readiness.overall.compareObservedReady ?? readiness.overall.compatReady ?? readiness.overall.verifyPassed),
      fullReady: Boolean(readiness.overall.fullVerifyPassed ?? readiness.overall.verifyPassed),
      latestVerifyFailed: false,
      needsStatusRefresh: false,
      lastVerifiedAt: readiness.timestamp,
      lastStatusRefreshAt: readiness.timestamp,
    },
    latestArtifacts: {
      handoffPath: 'docs/verification/HANDOFF-LATEST.MD',
      readinessPath: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContextPath: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
      workflowStatusPath: 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json',
      comparePath: describeArtifactPath(root, readiness.artifactPaths.comparePath || null, '未生成 compare 报告'),
      replayPath: describeArtifactPath(root, readiness.artifactPaths.replayPath || null, '未生成 replay 报告'),
      handoffFresh: fs.existsSync(handoffMarkdownPath),
      readinessFresh: Boolean(readinessPath),
      workflowFresh: fs.existsSync(path.join(root, 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json')),
    },
  });
  const activeWork = buildActiveWorkReport({ workflowSource, dirtyFiles });

  const reportBase: ProjectContextReport = {
    timestamp: new Date().toISOString(),
    mission: {
      northStar: '保持 `V2 主运行时 + baseline compare 观察层`，让任意新 session 都能沿同一收敛目标继续推进。',
      successDefinition: '新 session 只需先看 `HANDOFF-LATEST.MD`，再按固定顺序核对状态页与机读上下文，就能理解目标、当前阶段、活跃工作、代码热点与最短推进路径。',
      currentStage: readiness.overall.currentStage,
      acceptanceStatus: readiness.overall.acceptanceStatus,
    },
    readinessGates: {
      core: Boolean(readiness.overall.coreReady ?? readiness.overall.verifyPassed),
      baseline: Boolean(readiness.overall.v2BaselineReady ?? readiness.overall.canExpandGray),
      compare: Boolean(readiness.overall.compareObservedReady ?? readiness.overall.compatReady ?? readiness.overall.verifyPassed),
      full: Boolean(readiness.overall.fullVerifyPassed ?? readiness.overall.verifyPassed),
      canExpandGray: readiness.overall.canExpandGray,
      canPrepareMainRouteCut: readiness.overall.canPrepareMainRouteCut,
    },
    architectureInvariants: buildArchitectureInvariants(),
    sourceOfTruth: {
      primaryFiles: [
        '`docs/verification/HANDOFF-LATEST.MD`（最新 handoff 快照，适合直接给下一次对话）',
        '`TODO.MD`（整体目标 / 路线图 / 未完成项）',
        '`docs/verification/V2-READINESS-STATUS.MD`（详细 readiness / 风险 / replaceability 状态页）',
        '`docs/verification/HANDOFF-PROTOCOL.MD`（hand off 何时刷新、怎么接手的固定协议）',
        '`README.MD`（当前仓库结构与主运行时口径）',
      ],
      latestArtifacts: {
        readinessJson: describeArtifactPath(root, readinessPath, '未生成（建议先运行 `npm run workflow:refresh`）'),
        compareJson: describeArtifactPath(root, readiness.artifactPaths.comparePath || null, '未生成 compare 报告'),
        replayJson: describeArtifactPath(root, readiness.artifactPaths.replayPath || null, '未生成 replay 报告'),
        contextJsonLatest: relativePath(root, projectContextLatestPath),
      },
    },
    gitContext: {
      branchSummary,
      recentCommits,
      dirtyFiles,
      hasUncommittedChanges: dirtyFiles.length > 0,
    },
    activeWork: {
      ...activeWork,
      pendingVerification: toWorkflowCommands(activeWork.pendingVerification),
    },
    roadmap: readiness.roadmap,
    risksAndBlockers: {
      ...readiness.risksAndBlockers,
      mainBlockers: toWorkflowNarratives(readiness.risksAndBlockers.mainBlockers),
      missingExternalConditions: toWorkflowNarratives(readiness.risksAndBlockers.missingExternalConditions),
      rootCauseForNotReplacing: toWorkflowNarratives(readiness.risksAndBlockers.rootCauseForNotReplacing),
    },
    nextShortestPath: toWorkflowNarratives(readiness.nextShortestPath),
    sessionResume: {
      recommendedCommands: [],
      checklist: [],
      handoffPrompt: '',
    },
  };

  const report: ProjectContextReport = {
    ...reportBase,
    sessionResume: buildSessionResume(reportBase),
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(projectContextTimestampPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(projectContextLatestPath, JSON.stringify(report, null, 2));
  pruneHistoricalSnapshots(reportsDir, 5);

  const readinessMarkdownPath = path.join(root, 'docs/verification/V2-READINESS-STATUS.MD');
  const existingMarkdown = fs.existsSync(readinessMarkdownPath)
    ? fs.readFileSync(readinessMarkdownPath, 'utf-8')
    : '# V2 READINESS STATUS\n';
  const nextMarkdown = upsertContextSection(existingMarkdown, buildContextMarkdown(report));
  fs.writeFileSync(readinessMarkdownPath, nextMarkdown);
  fs.writeFileSync(handoffMarkdownPath, buildHandoffMarkdown(report));

  console.log(`Project context latest: ${projectContextLatestPath}`);
  console.log(`Project context snapshot: ${projectContextTimestampPath}`);
  console.log(`Readiness markdown updated with context: ${readinessMarkdownPath}`);
  console.log(`Handoff markdown updated: ${handoffMarkdownPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
