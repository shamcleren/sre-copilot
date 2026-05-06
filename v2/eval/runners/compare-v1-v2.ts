import fs from 'fs';
import path from 'path';
import { loadSuite, runReplaySuite, timestampLabel } from './replay-runner';
import type { InvestigationMode, ReplayCase, ReplayRunReport, ToolClass } from '../../src/contracts';

interface V1Case {
  id: string;
  category?: string;
  subcategory?: string;
  title: string;
  expect?: Record<string, unknown>;
}

interface V1ReportCheck {
  pass?: boolean;
}

interface V1ReportCase {
  id: string;
  title: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  checks?: V1ReportCheck[];
  replySnippet?: string;
  metadata?: {
    phase?: string;
    toolPlan?: Array<Record<string, unknown>>;
    toolCalls?: Array<{ tool?: string }>;
  };
}

interface V1Report {
  summary: string;
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  cases: V1ReportCase[];
}

const TOOL_CLASS_MAP: Record<string, ToolClass> = {
  query_promql: 'unify_query',
  query_metrics: 'unify_query',
  query_log: 'unify_query',
  query_trace: 'unify_query',
  list_tag_keys: 'unify_query',
  list_tag_values: 'unify_query',
  list_field_keys: 'unify_query',
  query_relation_multi_resource: 'relation',
  query_relation_multi_resource_range: 'relation',
  search_knowledge: 'knowledge',
  mcp_search_knowledge: 'knowledge',
  k8s_management: 'k8s',
  ssh_execute: 'ssh',
};

function repoRoot(): string {
  return path.resolve(__dirname, '../../..');
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(): {
  v1CasesPath?: string;
  v1ReportPath?: string;
  v2CasesPath?: string;
  strict: boolean;
} {
  const args = process.argv.slice(2);
  const result: {
    v1CasesPath?: string;
    v1ReportPath?: string;
    v2CasesPath?: string;
    strict: boolean;
  } = { strict: false };

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--v1-cases' && args[index + 1]) {
      result.v1CasesPath = args[index + 1];
      index += 1;
      continue;
    }
    if (args[index] === '--v1-report' && args[index + 1]) {
      result.v1ReportPath = args[index + 1];
      index += 1;
      continue;
    }
    if (args[index] === '--v2-cases' && args[index + 1]) {
      result.v2CasesPath = args[index + 1];
      index += 1;
      continue;
    }
    if (args[index] === '--strict') {
      result.strict = true;
    }
  }

  return result;
}

function resolveV1CasesPath(argPath?: string): string {
  if (argPath) {
    return path.resolve(process.cwd(), argPath);
  }
  return path.resolve(repoRoot(), 'eval/effect-tuning-shared-baseline.json');
}

function resolveV2CasesPath(argPath?: string): string {
  if (argPath) {
    return path.resolve(process.cwd(), argPath);
  }
  return path.resolve(repoRoot(), 'v2/eval/specs/replay/effect-tuning-all.v2.json');
}

function loadV1Report(reportPath: string): V1Report {
  return JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as V1Report;
}

function findBestMatchingV1Report(caseIds: Set<string>): { path: string; overlap: number } {
  const candidateDirs = [
    path.resolve(repoRoot(), 'eval/reports'),
    path.resolve(repoRoot(), 'docs/verification'),
  ];

  let bestPath = '';
  let bestOverlap = -1;

  for (const reportsDir of candidateDirs) {
    if (!fs.existsSync(reportsDir)) {
      continue;
    }

    const matches = fs
      .readdirSync(reportsDir)
      .filter((file) => /^EFFECT-TUNING-REPLAY-.*\.json$/i.test(file))
      .sort();

    for (const file of matches) {
      const reportPath = path.join(reportsDir, file);
      const report = loadV1Report(reportPath);
      const overlap = report.cases.reduce((count, item) => count + (caseIds.has(item.id) ? 1 : 0), 0);
      if (overlap > bestOverlap || (overlap === bestOverlap && reportPath > bestPath)) {
        bestPath = reportPath;
        bestOverlap = overlap;
      }
    }
  }

  if (!bestPath) {
    throw new Error(`No V1 replay reports found in ${candidateDirs.join(', ')}`);
  }

  return { path: bestPath, overlap: Math.max(bestOverlap, 0) };
}

function resolveV1ReportPath(argPath: string | undefined, caseIds: Set<string>): { path: string; overlap: number } {
  if (argPath) {
    return { path: path.resolve(process.cwd(), argPath), overlap: caseIds.size };
  }
  return findBestMatchingV1Report(caseIds);
}

function inferToolClasses(toolName: string): ToolClass[] {
  const name = String(toolName || '').toLowerCase();
  const classes = new Set<ToolClass>();
  if (!name) {
    return [];
  }
  if (TOOL_CLASS_MAP[name]) classes.add(TOOL_CLASS_MAP[name]);
  if (name === 'unify_query' || name === 'relation' || name === 'knowledge' || name === 'k8s' || name === 'ssh') {
    classes.add(name);
  }
  if (name.includes('query_') || name.includes('list_tag') || name.includes('list_field')) classes.add('unify_query');
  if (name.includes('relation')) classes.add('relation');
  if (name.includes('knowledge')) classes.add('knowledge');
  if (name.includes('k8s')) classes.add('k8s');
  if (name.includes('ssh')) classes.add('ssh');
  return [...classes];
}

function mapActionToMode(action: unknown): InvestigationMode | undefined {
  switch (String(action || '').trim()) {
    case 'request_evidence':
      return 'request_evidence';
    case 'continue_investigation':
      return 'continue_investigation';
    case 'collaborative_request':
      return 'collaborative_request';
    default:
      return undefined;
  }
}

function firstV1ToolClass(reportCase?: V1ReportCase): ToolClass | 'none' {
  const toolCalls = Array.isArray(reportCase?.metadata?.toolCalls)
    ? reportCase.metadata?.toolCalls ?? []
    : [];
  for (const toolCall of toolCalls) {
    const classes = inferToolClasses(String(toolCall.tool || ''));
    if (classes.length > 0) {
      return classes[0];
    }
  }

  const toolPlan = Array.isArray(reportCase?.metadata?.toolPlan)
    ? reportCase.metadata?.toolPlan ?? []
    : [];
  for (const item of toolPlan) {
    const name = String(item.toolName || item.tool || '');
    const classes = inferToolClasses(name);
    if (classes.length > 0) {
      return classes[0];
    }
  }

  return 'none';
}

type CompareDelta = 'improved' | 'regressed' | 'parity-pass' | 'parity-fail' | 'v1-missing';

export function preferredFirstToolSatisfied(firstToolClass: ToolClass | 'none', preferredFirstToolClasses?: ToolClass[]): boolean {
  return firstToolClass !== 'none'
    && Array.isArray(preferredFirstToolClasses)
    && preferredFirstToolClasses.length > 0
    && preferredFirstToolClasses.includes(firstToolClass);
}

export function collaborativeNoToolSatisfied(expectedMode: InvestigationMode | undefined, firstToolClass: ToolClass | 'none'): boolean {
  return expectedMode === 'collaborative_request' && firstToolClass === 'none';
}

function classifyDelta(params: {
  v1Status: string;
  v2Status: string;
  expectedMode?: InvestigationMode;
  v1FirstToolClass: ToolClass | 'none';
  v2FirstToolClass: ToolClass | 'none';
  preferredFirstToolClasses?: ToolClass[];
}): CompareDelta {
  const {
    v1Status,
    v2Status,
    expectedMode,
    v1FirstToolClass,
    v2FirstToolClass,
    preferredFirstToolClasses,
  } = params;

  if (v1Status === 'MISSING') {
    return 'v1-missing';
  }
  if (v1Status === 'PASS' && v2Status === 'PASS') {
    const v1PreferredSatisfied = preferredFirstToolSatisfied(v1FirstToolClass, preferredFirstToolClasses);
    const v2PreferredSatisfied = preferredFirstToolSatisfied(v2FirstToolClass, preferredFirstToolClasses);
    if (!v1PreferredSatisfied && v2PreferredSatisfied) {
      return 'improved';
    }
    const v1CollaborativeSatisfied = collaborativeNoToolSatisfied(expectedMode, v1FirstToolClass);
    const v2CollaborativeSatisfied = collaborativeNoToolSatisfied(expectedMode, v2FirstToolClass);
    if (!v1CollaborativeSatisfied && v2CollaborativeSatisfied) {
      return 'improved';
    }
    return 'parity-pass';
  }
  if (v1Status === 'PASS' && v2Status !== 'PASS') {
    return 'regressed';
  }
  if (v1Status !== 'PASS' && v2Status === 'PASS') {
    return 'improved';
  }
  return 'parity-fail';
}

export function firstToolClassesAligned(v1FirstToolClass: ToolClass | 'none', v2FirstToolClass: ToolClass | 'none'): boolean {
  return v1FirstToolClass === v2FirstToolClass;
}

function countPassedChecks(checks: V1ReportCheck[] | undefined): number {
  return Array.isArray(checks) ? checks.filter((item) => item.pass).length : 0;
}

function saveCompareReport(report: Record<string, unknown>): string {
  const reportsDir = path.resolve(repoRoot(), 'v2/eval/reports');
  ensureDir(reportsDir);
  const outputPath = path.join(reportsDir, `COMPARE-${timestampLabel()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
}

function main(): void {
  const args = parseArgs();
  const v1CasesPath = resolveV1CasesPath(args.v1CasesPath);
  const v2CasesPath = resolveV2CasesPath(args.v2CasesPath);

  const v1CasesData = JSON.parse(fs.readFileSync(v1CasesPath, 'utf-8')) as { cases: V1Case[] };
  const v1CaseIds = new Set(v1CasesData.cases.map((item) => item.id));
  const selectedV1Report = resolveV1ReportPath(args.v1ReportPath, v1CaseIds);
  const v1ReportPath = selectedV1Report.path;
  const v1Report = loadV1Report(v1ReportPath);
  const v2Suite = loadSuite(v2CasesPath);
  const v2Report: ReplayRunReport = runReplaySuite(v2Suite, { casesPath: v2CasesPath, log: false });

  const v1CasesById = new Map(v1CasesData.cases.map((item) => [item.id, item]));
  const v1ReportById = new Map(v1Report.cases.map((item) => [item.id, item]));
  const v2CasesById = new Map<string, ReplayCase>(v2Suite.cases.map((item) => [item.id, item]));

  const comparisons = v2Report.cases.map((v2Case) => {
    const v1Case = v1CasesById.get(v2Case.id);
    const v1Runtime = v1ReportById.get(v2Case.id);
    const replayCase = v2CasesById.get(v2Case.id);
    const expectedMode = mapActionToMode(v1Case?.expect?.action);
    const v1Status = v1Runtime?.status || 'MISSING';
    const v2FirstToolClass = v2Case.runtime.selectedToolClasses[0] ?? 'none';
    const v1FirstToolClass = firstV1ToolClass(v1Runtime);
    const preferredFirstToolClasses = replayCase?.trajectory_contract?.preferred_first_tool_classes ?? [];
    const delta = classifyDelta({
      v1Status,
      v2Status: v2Case.status,
      expectedMode,
      v1FirstToolClass,
      v2FirstToolClass,
      preferredFirstToolClasses,
    });

    return {
      id: v2Case.id,
      title: v2Case.title,
      source: v2Case.source,
      expectedMode,
      v1Status,
      v2Status: v2Case.status,
      delta,
      v1Phase: v1Runtime?.metadata?.phase || 'unknown',
      v2Mode: v2Case.runtime.mode,
      v1FirstToolClass,
      v2FirstToolClass,
      preferredFirstToolClasses,
      v1PreferredFirstToolSatisfied: preferredFirstToolSatisfied(v1FirstToolClass, preferredFirstToolClasses),
      v2PreferredFirstToolSatisfied: preferredFirstToolSatisfied(v2FirstToolClass, preferredFirstToolClasses),
      firstToolAligned: firstToolClassesAligned(v1FirstToolClass, v2FirstToolClass),
      modeAlignedToExpectation: expectedMode ? expectedMode === v2Case.runtime.mode : undefined,
      v1PassedChecks: countPassedChecks(v1Runtime?.checks),
      v2PassedChecks: v2Case.passed,
      v1TotalChecks: Array.isArray(v1Runtime?.checks) ? v1Runtime.checks.length : 0,
      v2TotalChecks: v2Case.total,
      v1ReplyLength: String(v1Runtime?.replySnippet || '').length,
      v2ReplyLength: v2Case.replySnippet.length,
    };
  });

  const summary = {
    total: comparisons.length,
    sharedCases: comparisons.filter((item) => item.v1Status !== 'MISSING').length,
    improved: comparisons.filter((item) => item.delta === 'improved').length,
    regressed: comparisons.filter((item) => item.delta === 'regressed').length,
    parityPass: comparisons.filter((item) => item.delta === 'parity-pass').length,
    parityFail: comparisons.filter((item) => item.delta === 'parity-fail').length,
    v1Missing: comparisons.filter((item) => item.delta === 'v1-missing').length,
    modeAligned: comparisons.filter((item) => item.modeAlignedToExpectation === true).length,
    firstToolAligned: comparisons.filter((item) => item.firstToolAligned === true).length,
  };

  const compareReport = {
    timestamp: new Date().toISOString(),
    paths: {
      v1CasesPath,
      v1ReportPath,
      v2CasesPath,
    },
    selectedV1Report: {
      overlap: selectedV1Report.overlap,
    },
    v1Summary: {
      summary: v1Report.summary,
      total: v1Report.total,
      passed: v1Report.passed,
      failed: v1Report.failed,
    },
    v2Summary: {
      summary: v2Report.summary,
      total: v2Report.total,
      passed: v2Report.passed,
      failed: v2Report.failed,
    },
    summary,
    comparisons,
  };

  const outputPath = saveCompareReport(compareReport);

  console.log(`Compared ${summary.total} cases (${summary.sharedCases} shared with selected baseline report)`);
  console.log(`Baseline report: ${v1ReportPath}`);
  console.log(`V2 cases : ${v2CasesPath}`);
  console.log(`Overlap=${selectedV1Report.overlap}, Improved=${summary.improved}, Regressed=${summary.regressed}, ParityPass=${summary.parityPass}, ParityFail=${summary.parityFail}`);
  console.log(`ModeAligned=${summary.modeAligned}, FirstToolAligned=${summary.firstToolAligned}`);
  console.log(`Report saved: ${outputPath}`);

  if (args.strict && summary.regressed > 0) {
    process.exit(1);
  }
}

main();
