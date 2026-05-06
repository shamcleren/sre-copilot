import type { WorkflowSourceSnapshot, WorkflowStateReport } from './types';

function isSameWorkspaceFingerprint(snapshot: WorkflowSourceSnapshot): boolean {
  const previous = snapshot.previousWorkflow;
  if (!previous) {
    return false;
  }

  return previous.currentFocus === snapshot.currentFocus
    && JSON.stringify(previous.dirtyHotspots) === JSON.stringify(snapshot.dirtyHotspots);
}

function hasVerifiedCurrentWorkspace(snapshot: WorkflowSourceSnapshot): boolean {
  const previous = snapshot.previousWorkflow;
  if (!previous?.lastVerifiedAt || !isSameWorkspaceFingerprint(snapshot)) {
    return false;
  }

  return previous.state !== 'verification_needed'
    && previous.state !== 'blocked';
}

function hasCompletedHandoffForCurrentWorkspace(snapshot: WorkflowSourceSnapshot): boolean {
  const previous = snapshot.previousWorkflow;
  if (!previous?.lastStatusRefreshAt || !isSameWorkspaceFingerprint(snapshot)) {
    return false;
  }

  const runtimeAlreadyVerified = !snapshot.dirtySummary.hasRuntimeChanges || hasVerifiedCurrentWorkspace(snapshot);

  return snapshot.dirtySummary.hasDocsChanges
    && runtimeAlreadyVerified
    && previous.state === 'ready_to_develop'
    && previous.artifacts.handoffFresh;
}

function buildReport(
  snapshot: WorkflowSourceSnapshot,
  state: WorkflowStateReport['state'],
  reason: string,
  requiredActions: string[],
  recommendedCommand: string,
): WorkflowStateReport {
  return {
    timestamp: snapshot.timestamp,
    state,
    reason,
    currentFocus: snapshot.currentFocus,
    dirtyHotspots: snapshot.dirtyHotspots,
    requiredActions,
    recommendedCommand,
    lastVerifiedAt: snapshot.readiness.lastVerifiedAt ?? null,
    lastStatusRefreshAt: snapshot.readiness.lastStatusRefreshAt ?? snapshot.previousWorkflow?.timestamp ?? null,
    artifacts: snapshot.latestArtifacts,
    derivedFrom: {
      todo: 'TODO.MD',
      git: 'git status --short',
      handoff: 'docs/verification/HANDOFF-LATEST.MD',
      readiness: 'docs/verification/V2-READINESS-STATUS.MD',
      projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json',
    },
  };
}

export function detectWorkflowState(snapshot: WorkflowSourceSnapshot): WorkflowStateReport {
  if (snapshot.readiness.latestVerifyFailed) {
    return buildReport(
      snapshot,
      'blocked',
      'latest verification failed and the workspace cannot safely continue before the failure is resolved',
      ['修复最近一次验证失败'],
      'npm run workflow:check',
    );
  }

  if (snapshot.dirtySummary.hasUnknownChanges) {
    return buildReport(
      snapshot,
      'blocked',
      `unknown high-risk dirty files detected: ${snapshot.dirtySummary.unknownFiles.join(', ')}`,
      ['先确认未知改动的影响范围'],
      'npm run workflow:check',
    );
  }

  if (!snapshot.latestArtifacts.workflowFresh || !snapshot.readiness.available) {
    return buildReport(
      snapshot,
      'resume_needed',
      'workflow status baseline is missing/stale, so the session should resume from a fresh workflow snapshot first',
      ['先刷新 workflow 现场'],
      'npm run workflow:resume',
    );
  }

  if ((snapshot.dirtySummary.hasRuntimeChanges && !hasVerifiedCurrentWorkspace(snapshot))
    || (snapshot.dirtyFiles.length > 0 && !snapshot.readiness.coreReady)) {
    return buildReport(
      snapshot,
      'verification_needed',
      'runtime or entrypoint changes were detected and minimal verify has not been confirmed yet',
      ['运行最小必要验证'],
      'npm run workflow:verify',
    );
  }

  if (snapshot.readiness.needsStatusRefresh || !snapshot.latestArtifacts.readinessFresh) {
    return buildReport(
      snapshot,
      'status_refresh_needed',
      'derived status views are stale compared with the current workspace state',
      ['刷新 readiness 状态页', '写回 workflow 最新状态'],
      'npm run workflow:refresh',
    );
  }

  if (snapshot.dirtySummary.hasDocsChanges && hasCompletedHandoffForCurrentWorkspace(snapshot)) {
    return buildReport(
      snapshot,
      'ready_to_develop',
      'current workspace already has a published handoff snapshot',
      [],
      'none',
    );
  }

  if (snapshot.dirtySummary.hasDocsChanges) {
    return buildReport(
      snapshot,
      'handoff_ready',
      'documentation-facing changes are classified and the workspace is ready to publish a fresh handoff snapshot',
      ['生成最新 handoff 快照'],
      'npm run workflow:handoff',
    );
  }

  return buildReport(
    snapshot,
    'ready_to_develop',
    'workspace is classified and no higher-priority workflow action is required',
    [],
    'none',
  );
}
