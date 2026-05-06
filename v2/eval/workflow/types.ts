export type WorkflowState =
  | 'blocked'
  | 'resume_needed'
  | 'verification_needed'
  | 'status_refresh_needed'
  | 'handoff_ready'
  | 'ready_to_develop';

export type WorkflowAction = 'check' | 'resume' | 'verify' | 'refresh' | 'handoff';

export interface WorkflowDirtySummary {
  hasRuntimeChanges: boolean;
  hasDocsChanges: boolean;
  hasUnknownChanges: boolean;
  unknownFiles: string[];
}

export interface WorkflowLatestArtifacts {
  handoffPath: string;
  readinessPath: string;
  projectContextPath: string;
  workflowStatusPath: string;
  comparePath: string;
  replayPath: string;
  handoffFresh: boolean;
  readinessFresh: boolean;
  workflowFresh: boolean;
}

export interface WorkflowReadinessSnapshot {
  available: boolean;
  currentStage: string;
  acceptanceStatus: string;
  coreReady: boolean;
  baselineReady: boolean;
  compareReady: boolean;
  fullReady: boolean;
  latestVerifyFailed: boolean;
  needsStatusRefresh: boolean;
  lastVerifiedAt?: string | null;
  lastStatusRefreshAt?: string | null;
}

export interface WorkflowGitFileView {
  status: string;
  file: string;
}

export interface WorkflowStateReport {
  timestamp: string;
  state: WorkflowState;
  reason: string;
  currentFocus: string;
  dirtyHotspots: string[];
  requiredActions: string[];
  recommendedCommand: string;
  lastVerifiedAt?: string | null;
  lastStatusRefreshAt?: string | null;
  artifacts: WorkflowLatestArtifacts;
  derivedFrom: {
    todo: 'TODO.MD';
    git: 'git status --short';
    handoff: 'docs/verification/HANDOFF-LATEST.MD';
    readiness: 'docs/verification/V2-READINESS-STATUS.MD';
    projectContext: 'v2/eval/reports/PROJECT-CONTEXT-LATEST.json';
  };
}

export interface WorkflowSourceSnapshot {
  timestamp: string;
  currentFocus: string;
  openTodos: string[];
  dirtyFiles: WorkflowGitFileView[];
  dirtyHotspots: string[];
  dirtySummary: WorkflowDirtySummary;
  latestArtifacts: WorkflowLatestArtifacts;
  readiness: WorkflowReadinessSnapshot;
  previousWorkflow: WorkflowStateReport | null;
}
