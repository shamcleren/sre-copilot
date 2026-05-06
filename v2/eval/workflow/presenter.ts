import type { WorkflowStateReport } from './types';

export function formatWorkflowSummary(report: WorkflowStateReport): string {
  const required = report.requiredActions.length > 0 ? report.requiredActions.join('；') : '无';
  const hotspots = report.dirtyHotspots.length > 0 ? report.dirtyHotspots.join('；') : '无';

  return [
    '## Workflow 状态',
    '',
    `- 当前状态: ${report.state}`,
    `- 当前重点: ${report.currentFocus}`,
    `- 原因: ${report.reason}`,
    `- 当前改动热点: ${hotspots}`,
    `- 必需动作: ${required}`,
    `- 推荐命令: ${report.recommendedCommand}`,
  ].join('\n');
}
