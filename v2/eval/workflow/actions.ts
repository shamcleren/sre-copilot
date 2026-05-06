import type { WorkflowAction, WorkflowStateReport } from './types';

export function buildWorkflowDisplayPlan(action: WorkflowAction, internalCommands: string[]): string[] {
  if (internalCommands.length === 0) {
    return [];
  }

  if (action === 'verify') {
    return ['npm run workflow:verify'];
  }

  if (action === 'refresh') {
    return ['npm run workflow:refresh'];
  }

  if (action === 'handoff') {
    return ['npm run workflow:handoff'];
  }

  return [];
}

export function buildWorkflowCommandPlan(action: WorkflowAction, report: WorkflowStateReport): string[] {
  if (action === 'check' || action === 'resume') {
    return [];
  }

  if (action === 'verify') {
    return ['bash scripts/test/verify-v2-core.sh'];
  }

  if (action === 'refresh') {
    return ['bash scripts/test/report-v2-readiness.sh'];
  }

  if (action === 'handoff') {
    return report.state === 'status_refresh_needed'
      ? ['bash scripts/test/report-v2-readiness.sh']
      : ['./node_modules/.bin/tsx v2/eval/runners/project-context-status.ts'];
  }

  return [];
}
