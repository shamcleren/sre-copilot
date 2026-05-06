import type { RuntimeResult } from '../contracts';

export function toReplaySnapshot(result: RuntimeResult) {
  return {
    playbookId: result.playbookId,
    mode: result.mode,
    selectedToolClasses: result.selectedToolClasses,
    evidence: result.evidence,
    blocker: result.blocker,
    conclusion: result.conclusion,
  };
}
