import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { detectWorkflowState } from '../workflow/detector';
import {
  parseDirtyFiles,
  readJsonFile,
  relativePath,
  repoRoot,
  safeExec,
  summarizeWorkflowSources,
  timestampLabel,
  tryLatestFile,
} from '../workflow/source-snapshot';
import { buildWorkflowCommandPlan, buildWorkflowDisplayPlan } from '../workflow/actions';
import { formatWorkflowSummary } from '../workflow/presenter';
import type {
  WorkflowAction,
  WorkflowLatestArtifacts,
  WorkflowReadinessSnapshot,
  WorkflowStateReport,
} from '../workflow/types';

interface ReadinessReportLike {
  timestamp: string;
  overall: {
    currentStage: string;
    acceptanceStatus: string;
    canExpandGray?: boolean;
    verifyPassed?: boolean;
    fullVerifyPassed?: boolean;
    coreVerifyPassed?: boolean;
    compareVerifyPassed?: boolean;
    coreReady?: boolean;
    compareObservedReady?: boolean;
    v2BaselineReady?: boolean;
  };
  artifactPaths?: {
    comparePath?: string;
    replayPath?: string;
  };
}

function normalizeArtifactPath(root: string, targetPath: string | null | undefined, fallback: string): string {
  if (!targetPath || targetPath === '未生成') {
    return fallback;
  }
  if (path.isAbsolute(targetPath)) {
    return relativePath(root, targetPath);
  }
  return targetPath;
}

function buildFallbackReadiness(): WorkflowReadinessSnapshot {
  return {
    available: false,
    currentStage: '待刷新 workflow/readiness 基线',
    acceptanceStatus: '未知',
    coreReady: false,
    baselineReady: false,
    compareReady: false,
    fullReady: false,
    latestVerifyFailed: false,
    needsStatusRefresh: true,
    lastVerifiedAt: null,
    lastStatusRefreshAt: null,
  };
}

function toWorkflowReadiness(report: ReadinessReportLike | null): WorkflowReadinessSnapshot {
  if (!report) {
    return buildFallbackReadiness();
  }

  const acceptanceStatus = report.overall.acceptanceStatus || '未知';
  const latestVerifyFailed = /失败|阻塞/u.test(acceptanceStatus)
    || (report.overall.coreVerifyPassed === false)
    || (report.overall.fullVerifyPassed === false && report.overall.verifyPassed === false);

  return {
    available: true,
    currentStage: report.overall.currentStage || '未知',
    acceptanceStatus,
    coreReady: Boolean(report.overall.coreReady ?? report.overall.coreVerifyPassed ?? report.overall.verifyPassed),
    baselineReady: Boolean(report.overall.v2BaselineReady ?? report.overall.canExpandGray),
    compareReady: Boolean(report.overall.compareObservedReady ?? report.overall.compareVerifyPassed),
    fullReady: Boolean(report.overall.fullVerifyPassed ?? report.overall.verifyPassed),
    latestVerifyFailed,
    needsStatusRefresh: false,
    lastVerifiedAt: report.timestamp,
    lastStatusRefreshAt: report.timestamp,
  };
}

function readPreviousWorkflow(root: string): WorkflowStateReport | null {
  const workflowStatusPath = path.join(root, 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json');
  if (!fs.existsSync(workflowStatusPath)) {
    return null;
  }
  return readJsonFile<WorkflowStateReport>(workflowStatusPath);
}

function buildLatestArtifacts(
  root: string,
  readinessJsonPath: string | null,
  readiness: ReadinessReportLike | null,
  previousWorkflow: WorkflowStateReport | null,
): WorkflowLatestArtifacts {
  const reportsDir = path.join(root, 'v2/eval/reports');
  const evalReportsDir = path.join(root, 'eval/reports');
  const handoffAbsolute = path.join(root, 'docs/verification/HANDOFF-LATEST.MD');
  const readinessMarkdownAbsolute = path.join(root, 'docs/verification/V2-READINESS-STATUS.MD');
  const projectContextAbsolute = path.join(reportsDir, 'PROJECT-CONTEXT-LATEST.json');
  const workflowStatusAbsolute = path.join(reportsDir, 'WORKFLOW-STATUS-LATEST.json');
  const comparePath = readiness?.artifactPaths?.comparePath || tryLatestFile(reportsDir, /^COMPARE-.*\.json$/i) || '';
  const replayPath = readiness?.artifactPaths?.replayPath || tryLatestFile(evalReportsDir, /^REPLAY-.*\.json$/i) || '';

  return {
    handoffPath: normalizeArtifactPath(root, handoffAbsolute, 'docs/verification/HANDOFF-LATEST.MD'),
    readinessPath: normalizeArtifactPath(root, readinessMarkdownAbsolute, 'docs/verification/V2-READINESS-STATUS.MD'),
    projectContextPath: normalizeArtifactPath(root, projectContextAbsolute, 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json'),
    workflowStatusPath: normalizeArtifactPath(root, workflowStatusAbsolute, 'v2/eval/reports/WORKFLOW-STATUS-LATEST.json'),
    comparePath: normalizeArtifactPath(root, comparePath, 'v2/eval/reports/COMPARE-LATEST.json'),
    replayPath: normalizeArtifactPath(root, replayPath, 'eval/reports/REPLAY-LATEST.json'),
    handoffFresh: fs.existsSync(handoffAbsolute),
    readinessFresh: Boolean(readinessJsonPath) && fs.existsSync(readinessMarkdownAbsolute),
    workflowFresh: previousWorkflow !== null,
  };
}

function loadWorkflowSnapshot(root: string) {
  const reportsDir = path.join(root, 'v2/eval/reports');
  const readinessJsonPath = tryLatestFile(reportsDir, /^READINESS-.*\.json$/i);
  const readinessReport = readinessJsonPath ? readJsonFile<ReadinessReportLike>(readinessJsonPath) : null;
  const previousWorkflow = readPreviousWorkflow(root);
  const todoContent = fs.existsSync(path.join(root, 'TODO.MD'))
    ? fs.readFileSync(path.join(root, 'TODO.MD'), 'utf-8')
    : '';
  const dirtyFiles = parseDirtyFiles(safeExec(root, 'git --no-pager status --short'));

  return summarizeWorkflowSources({
    root,
    todoContent,
    dirtyFiles,
    readiness: toWorkflowReadiness(readinessReport),
    latestArtifacts: buildLatestArtifacts(root, readinessJsonPath, readinessReport, previousWorkflow),
    previousWorkflow,
  });
}

function parseAction(argv: string[]): WorkflowAction {
  const requested = argv.find((item) => item.startsWith('--action='))?.replace(/^--action=/, '') || 'check';
  if (requested === 'resume' || requested === 'verify' || requested === 'refresh' || requested === 'handoff') {
    return requested;
  }
  return 'check';
}

function shouldOutputJson(argv: string[]): boolean {
  return argv.includes('--json');
}

function runCommandPlan(root: string, commands: string[]): void {
  for (const command of commands) {
    execSync(command, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
  }
}

function pruneWorkflowSnapshots(reportsDir: string, keepLatest: number): void {
  const filesToRemove = fs
    .readdirSync(reportsDir)
    .filter((file) => /^WORKFLOW-STATUS-\d{8}T\d{6}Z\.json$/i.test(file))
    .sort()
    .slice(0, Math.max(0, fs.readdirSync(reportsDir).filter((file) => /^WORKFLOW-STATUS-\d{8}T\d{6}Z\.json$/i.test(file)).length - keepLatest));

  for (const file of filesToRemove) {
    fs.rmSync(path.join(reportsDir, file), { force: true });
  }
}

export function writeWorkflowStatusReport(reportsDir: string, report: WorkflowStateReport): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const latestPath = path.join(reportsDir, 'WORKFLOW-STATUS-LATEST.json');
  const timestampPath = path.join(reportsDir, `WORKFLOW-STATUS-${timestampLabel()}.json`);
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(timestampPath, JSON.stringify(report, null, 2));
  pruneWorkflowSnapshots(reportsDir, 10);
  return latestPath;
}

export function applyWorkflowActionOutcome(action: WorkflowAction, report: WorkflowStateReport): WorkflowStateReport {
  if (action === 'verify' && report.state === 'verification_needed') {
    return {
      ...report,
      state: 'status_refresh_needed',
      reason: 'verify finished successfully, but derived status views still need refresh before the workflow can move forward',
      requiredActions: ['刷新 readiness 状态页', '写回 workflow 最新状态'],
      recommendedCommand: 'npm run workflow:refresh',
      lastVerifiedAt: new Date().toISOString(),
      artifacts: {
        ...report.artifacts,
        readinessFresh: false,
        workflowFresh: true,
      },
    };
  }

  if (action === 'handoff' && report.state === 'handoff_ready') {
    return {
      ...report,
      state: 'ready_to_develop',
      reason: 'current workspace already has a published handoff snapshot',
      requiredActions: [],
      recommendedCommand: 'none',
      lastStatusRefreshAt: new Date().toISOString(),
      artifacts: {
        ...report.artifacts,
        handoffFresh: true,
        workflowFresh: true,
      },
    };
  }

  return report;
}

export function buildWorkflowJsonPayload(params: {
  root: string;
  latestPath: string;
  report: WorkflowStateReport;
  action: WorkflowAction;
  internalCommands: string[];
}): {
  report: WorkflowStateReport;
  commands: string[];
  statusFile: string;
} {
  return {
    report: params.report,
    commands: buildWorkflowDisplayPlan(params.action, params.internalCommands),
    statusFile: relativePath(params.root, params.latestPath),
  };
}

async function main(): Promise<void> {
  const root = repoRoot();
  const action = parseAction(process.argv);
  let snapshot = loadWorkflowSnapshot(root);
  let report = detectWorkflowState(snapshot);
  const internalCommands = buildWorkflowCommandPlan(action, report);
  const reportBeforeAction = report;

  if (internalCommands.length > 0) {
    runCommandPlan(root, internalCommands);
    snapshot = loadWorkflowSnapshot(root);
    report = detectWorkflowState(snapshot);
    if ((action === 'verify' && reportBeforeAction.state === 'verification_needed')
      || (action === 'handoff' && (reportBeforeAction.state === 'handoff_ready' || reportBeforeAction.state === 'status_refresh_needed'))) {
      report = applyWorkflowActionOutcome(action, report);
    }
  }

  const latestPath = writeWorkflowStatusReport(path.join(root, 'v2/eval/reports'), report);

  if (shouldOutputJson(process.argv)) {
    console.log(JSON.stringify(buildWorkflowJsonPayload({
      root,
      latestPath,
      report,
      action,
      internalCommands,
    }), null, 2));
    return;
  }

  console.log(formatWorkflowSummary(report));
  console.log(`状态文件: ${relativePath(root, latestPath)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
