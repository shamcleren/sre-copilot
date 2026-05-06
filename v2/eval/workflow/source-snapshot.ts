import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type {
  WorkflowDirtySummary,
  WorkflowGitFileView,
  WorkflowLatestArtifacts,
  WorkflowReadinessSnapshot,
  WorkflowSourceSnapshot,
  WorkflowStateReport,
} from './types';

export interface WorkflowSourceInput {
  root: string;
  todoContent: string;
  dirtyFiles: WorkflowGitFileView[];
  readiness: WorkflowReadinessSnapshot;
  latestArtifacts: WorkflowLatestArtifacts;
  previousWorkflow?: WorkflowStateReport | null;
}

export function repoRoot(): string {
  return path.resolve(__dirname, '../../..');
}

export function timestampLabel(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function tryLatestFile(directory: string, pattern: RegExp): string | null {
  if (!fs.existsSync(directory)) {
    return null;
  }

  const matches = fs.readdirSync(directory).filter((file) => pattern.test(file)).sort();
  return matches.length === 0 ? null : path.join(directory, matches[matches.length - 1]);
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

export function relativePath(root: string, targetPath: string): string {
  return path.relative(root, targetPath).replace(/\\/g, '/');
}

function stripTrailingWhitespace(value: string): string {
  return value.replace(/\s+$/u, '');
}

export function safeExec(root: string, command: string): string {
  try {
    return stripTrailingWhitespace(String(execSync(command, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    })));
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error
      ? stripTrailingWhitespace(String((error as { stderr?: string }).stderr || ''))
      : '';
    return stderr || '';
  }
}

function shouldIgnoreDirtyFile(filePath: string): boolean {
  return filePath.startsWith('.codebuddy/');
}

export function parseDirtyFiles(statusOutput: string): WorkflowGitFileView[] {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => ({
      status: line.slice(0, 2).trim() || line.slice(0, 2),
      file: line.slice(3).trim(),
    }))
    .filter((item) => !shouldIgnoreDirtyFile(item.file));
}

export function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

export function extractTodoCurrentFocus(todoContent: string): string {
  const match = todoContent.match(/\|\s*当前重点\s*\|\s*(.+?)\s*\|/u);
  return match?.[1]?.trim() || '未在 `TODO.MD` 中显式标注当前重点';
}

function extractNextStageSection(todoContent: string): string {
  const match = todoContent.match(/## 下一阶段待办（按需推进）([\s\S]*?)(?:\n### 已决策暂缓|\n## 已完成|$)/u);
  return match?.[1] || todoContent;
}

export function extractOpenTodoItems(todoContent: string, limit = 5): string[] {
  const nextStageSection = extractNextStageSection(todoContent);
  const openItems = nextStageSection
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const match = line.match(/^- \[ \] (.+)$/u);
      return match ? [match[1].trim()] : [];
    });
  return uniqueNonEmpty(openItems).slice(0, limit);
}

export function buildDirtyHotspots(dirtyFiles: WorkflowGitFileView[], limit = 6): string[] {
  if (dirtyFiles.length === 0) {
    return [];
  }
  return dirtyFiles.slice(0, limit).map((item) => `${item.status} ${item.file}`);
}

function isKnownRuntimeFile(file: string): boolean {
  return file.startsWith('v2/')
    || file.startsWith('scripts/test/')
    || file.startsWith('scripts/deploy/')
    || file.startsWith('scripts/dev/')
    || file.startsWith('scripts/tools/')
    || file.startsWith('config/')
    || file.startsWith('eval/')
    || file.startsWith('v1/')
    || file === 'package.json'
    || file === 'package-lock.json'
    || file === 'Makefile'
    || file === 'Dockerfile'
    || file === 'nginx-local.conf'
    || file === '.gitignore'
    || file === '.dockerignore';
}

function isKnownDocsFile(file: string): boolean {
  return file.startsWith('docs/')
    || file.startsWith('knowledge/')
    || file === 'README.MD'
    || file === 'LOCAL-DEV-GUIDE.MD'
    || file === 'DEPLOYMENT-GUIDE.MD'
    || file === 'TODO.MD'
    || file === 'CHANGELOG.MD'
    || file === 'AGENTS.MD';
}

export function classifyDirtyFiles(dirtyFiles: WorkflowGitFileView[]): WorkflowDirtySummary {
  const hasRuntimeChanges = dirtyFiles.some((item) => isKnownRuntimeFile(item.file));
  const hasDocsChanges = dirtyFiles.some((item) => isKnownDocsFile(item.file));

  const unknownFiles = dirtyFiles
    .map((item) => item.file)
    .filter((file) => !isKnownRuntimeFile(file) && !isKnownDocsFile(file));

  return {
    hasRuntimeChanges,
    hasDocsChanges,
    hasUnknownChanges: unknownFiles.length > 0,
    unknownFiles,
  };
}

export function buildPendingVerification(
  dirtySummary: WorkflowDirtySummary,
  dirtyFiles: WorkflowGitFileView[],
): string[] {
  const commands: string[] = [];

  if (dirtySummary.hasRuntimeChanges || dirtySummary.hasUnknownChanges) {
    commands.push('npm run runtime:verify:core');
  }

  const hasDocOrStatusChanges = dirtySummary.hasDocsChanges || dirtyFiles.length === 0;
  if (hasDocOrStatusChanges) {
    commands.push('npm run runtime:handoff');
  }

  commands.push('npm run runtime:status');
  return uniqueNonEmpty(commands);
}

export function summarizeWorkflowSources(input: WorkflowSourceInput): WorkflowSourceSnapshot {
  const dirtySummary = classifyDirtyFiles(input.dirtyFiles);
  const currentFocus = extractTodoCurrentFocus(input.todoContent);
  const openTodos = extractOpenTodoItems(input.todoContent);
  const dirtyHotspots = buildDirtyHotspots(input.dirtyFiles);
  const previousWorkflow = input.previousWorkflow ?? null;

  return {
    timestamp: new Date().toISOString(),
    currentFocus,
    openTodos,
    dirtyFiles: input.dirtyFiles,
    dirtyHotspots,
    dirtySummary,
    latestArtifacts: {
      ...input.latestArtifacts,
      workflowFresh: input.latestArtifacts.workflowFresh || Boolean(
        previousWorkflow
          && previousWorkflow.currentFocus === currentFocus
          && JSON.stringify(previousWorkflow.dirtyHotspots) === JSON.stringify(dirtyHotspots),
      ),
    },
    readiness: input.readiness,
    previousWorkflow,
  };
}
