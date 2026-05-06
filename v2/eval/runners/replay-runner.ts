import fs from 'fs';
import path from 'path';
import type {
  BlockerCode,
  EvidenceType,
  InvestigationMode,
  ReplayCase,
  ReplayCaseReport,
  ReplayRunReport,
  ReplaySuite,
  ToolClass,
} from '../../src/contracts';
import { executeCase } from '../../src/runtime';
import { judgeReplayCase } from '../judges/contract-judges';

const INVESTIGATION_MODES = new Set<InvestigationMode>([
  'request_evidence',
  'continue_investigation',
  'collaborative_request',
]);
const TOOL_CLASSES = new Set<ToolClass>(['unify_query', 'relation', 'knowledge', 'k8s', 'ssh']);
const EVIDENCE_TYPES = new Set<EvidenceType>([
  'service_resolution',
  'runtime_signal',
  'query_artifact',
  'gap',
  'user_supplied',
  'tool_result',
  'tool_failure',
]);
const BLOCKER_CODES = new Set<BlockerCode>([
  'missing_target',
  'insufficient_context',
  'empty_result',
  'tool_timeout',
  'authentication_failed',
  'permission_denied',
  'tool_error',
  'adapter_unavailable',
]);

function parseArgs(): { casesFile?: string } {
  const args = process.argv.slice(2);
  const result: { casesFile?: string } = {};

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--cases' && args[index + 1]) {
      result.casesFile = args[index + 1];
      index += 1;
    }
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertRecord(value: unknown, fieldPath: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid replay suite: ${fieldPath} must be an object`);
  }
  return value;
}

function assertString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid replay suite: ${fieldPath} must be a non-empty string`);
  }
  return value;
}

function assertOptionalString(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  if (typeof value !== 'string') {
    throw new Error(`Invalid replay suite: ${fieldPath} must be a string`);
  }
}

function assertOptionalBoolean(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid replay suite: ${fieldPath} must be a boolean`);
  }
}

function assertOptionalNumber(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid replay suite: ${fieldPath} must be a number`);
  }
}

function assertStringArray(value: unknown, fieldPath: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid replay suite: ${fieldPath} must be an array of strings`);
  }
  return value;
}

function assertEnumArray<T extends string>(
  value: unknown,
  fieldPath: string,
  allowed: Set<T>,
): T[] {
  const items = assertStringArray(value, fieldPath);
  for (const item of items) {
    if (!allowed.has(item as T)) {
      throw new Error(`Invalid replay suite: ${fieldPath} contains unsupported value "${item}"`);
    }
  }
  return items as T[];
}

function assertNestedStringArray(value: unknown, fieldPath: string): void {
  if (!Array.isArray(value) || value.some((group) => !Array.isArray(group) || group.some((item) => typeof item !== 'string'))) {
    throw new Error(`Invalid replay suite: ${fieldPath} must be an array of string arrays`);
  }
}

function validateIntentContract(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  const record = assertRecord(value, fieldPath);
  if (record.expected_mode !== undefined && !INVESTIGATION_MODES.has(record.expected_mode as InvestigationMode)) {
    throw new Error(`Invalid replay suite: ${fieldPath}.expected_mode contains unsupported value`);
  }
  if (record.must_not_mode !== undefined) {
    assertEnumArray(record.must_not_mode, `${fieldPath}.must_not_mode`, INVESTIGATION_MODES);
  }
}

function validateTrajectoryContract(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  const record = assertRecord(value, fieldPath);
  if (record.preferred_first_tool_classes !== undefined) {
    assertEnumArray(record.preferred_first_tool_classes, `${fieldPath}.preferred_first_tool_classes`, TOOL_CLASSES);
  }
  if (record.forbidden_first_tool_classes !== undefined) {
    assertEnumArray(record.forbidden_first_tool_classes, `${fieldPath}.forbidden_first_tool_classes`, TOOL_CLASSES);
  }
}

function validateEvidenceContract(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  const record = assertRecord(value, fieldPath);
  if (record.must_have_any !== undefined) {
    assertEnumArray(record.must_have_any, `${fieldPath}.must_have_any`, EVIDENCE_TYPES);
  }
  if (record.must_have_all !== undefined) {
    assertEnumArray(record.must_have_all, `${fieldPath}.must_have_all`, EVIDENCE_TYPES);
  }
  assertOptionalBoolean(record.must_not_be_knowledge_only, `${fieldPath}.must_not_be_knowledge_only`);
}

function validateBlockerContract(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  const record = assertRecord(value, fieldPath);
  assertOptionalBoolean(record.expect_present, `${fieldPath}.expect_present`);
  if (record.expected_code !== undefined && !BLOCKER_CODES.has(record.expected_code as BlockerCode)) {
    throw new Error(`Invalid replay suite: ${fieldPath}.expected_code contains unsupported value`);
  }
  if (record.allowed_codes !== undefined) {
    assertEnumArray(record.allowed_codes, `${fieldPath}.allowed_codes`, BLOCKER_CODES);
  }
  if (record.forbidden_codes !== undefined) {
    assertEnumArray(record.forbidden_codes, `${fieldPath}.forbidden_codes`, BLOCKER_CODES);
  }
  assertOptionalBoolean(record.expected_retryable, `${fieldPath}.expected_retryable`);
  assertOptionalString(record.expected_tool_name, `${fieldPath}.expected_tool_name`);
  if (record.missing_any !== undefined) {
    assertStringArray(record.missing_any, `${fieldPath}.missing_any`);
  }
  if (record.missing_all !== undefined) {
    assertStringArray(record.missing_all, `${fieldPath}.missing_all`);
  }
}

function validateConclusionContract(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  const record = assertRecord(value, fieldPath);
  if (record.summary_must_contain_keywords !== undefined) {
    assertStringArray(record.summary_must_contain_keywords, `${fieldPath}.summary_must_contain_keywords`);
  }
  if (record.next_actions_must_contain_keywords !== undefined) {
    assertStringArray(record.next_actions_must_contain_keywords, `${fieldPath}.next_actions_must_contain_keywords`);
  }
  if (record.hypotheses_must_contain_keywords !== undefined) {
    assertStringArray(record.hypotheses_must_contain_keywords, `${fieldPath}.hypotheses_must_contain_keywords`);
  }
  if (record.confirmed_facts_must_contain_keywords !== undefined) {
    assertStringArray(record.confirmed_facts_must_contain_keywords, `${fieldPath}.confirmed_facts_must_contain_keywords`);
  }
  if (record.missing_evidence_any !== undefined) {
    assertStringArray(record.missing_evidence_any, `${fieldPath}.missing_evidence_any`);
  }
  if (record.missing_evidence_all !== undefined) {
    assertStringArray(record.missing_evidence_all, `${fieldPath}.missing_evidence_all`);
  }
}

function validateToolExecutionContract(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  const record = assertRecord(value, fieldPath);
  assertOptionalNumber(record.min_calls, `${fieldPath}.min_calls`);
  assertOptionalNumber(record.max_calls, `${fieldPath}.max_calls`);
  assertOptionalString(record.expected_adapter, `${fieldPath}.expected_adapter`);
  if (record.required_tool_names !== undefined) {
    assertStringArray(record.required_tool_names, `${fieldPath}.required_tool_names`);
  }
  if (record.required_blocker_codes !== undefined) {
    assertEnumArray(record.required_blocker_codes, `${fieldPath}.required_blocker_codes`, BLOCKER_CODES);
  }
  assertOptionalBoolean(record.must_have_success, `${fieldPath}.must_have_success`);
  assertOptionalBoolean(record.must_have_failure, `${fieldPath}.must_have_failure`);
  assertOptionalBoolean(record.require_duration_ms, `${fieldPath}.require_duration_ms`);
}

function validateResponseContract(value: unknown, fieldPath: string): void {
  if (value === undefined) return;
  const record = assertRecord(value, fieldPath);
  if (record.semantic_criteria !== undefined) {
    assertStringArray(record.semantic_criteria, `${fieldPath}.semantic_criteria`);
  }
  if (record.must_include_sections !== undefined) {
    assertStringArray(record.must_include_sections, `${fieldPath}.must_include_sections`);
  }
  if (record.must_contain_keywords !== undefined) {
    assertStringArray(record.must_contain_keywords, `${fieldPath}.must_contain_keywords`);
  }
  if (record.must_contain_any_groups !== undefined) {
    assertNestedStringArray(record.must_contain_any_groups, `${fieldPath}.must_contain_any_groups`);
  }
  if (record.must_not_contain_keywords !== undefined) {
    assertStringArray(record.must_not_contain_keywords, `${fieldPath}.must_not_contain_keywords`);
  }
  assertOptionalBoolean(record.must_not_be_generic_manual, `${fieldPath}.must_not_be_generic_manual`);
  assertOptionalNumber(record.max_reply_length, `${fieldPath}.max_reply_length`);
}

function validateReplayCase(value: unknown, fieldPath: string): ReplayCase {
  const record = assertRecord(value, fieldPath);
  const id = assertString(record.id, `${fieldPath}.id`);
  const title = assertString(record.title, `${fieldPath}.title`);
  const inputRecord = assertRecord(record.input, `${fieldPath}.input`);
  const message = assertString(inputRecord.message, `${fieldPath}.input.message`);
  const context = inputRecord.context === undefined
    ? undefined
    : assertRecord(inputRecord.context, `${fieldPath}.input.context`);

  validateIntentContract(record.intent_contract, `${fieldPath}.intent_contract`);
  validateTrajectoryContract(record.trajectory_contract, `${fieldPath}.trajectory_contract`);
  validateEvidenceContract(record.evidence_contract, `${fieldPath}.evidence_contract`);
  validateBlockerContract(record.blocker_contract, `${fieldPath}.blocker_contract`);
  validateConclusionContract(record.conclusion_contract, `${fieldPath}.conclusion_contract`);
  validateToolExecutionContract(record.tool_execution_contract, `${fieldPath}.tool_execution_contract`);
  validateResponseContract(record.response_contract, `${fieldPath}.response_contract`);

  let normalizedSource: ReplayCase['source'];
  if (record.source !== undefined) {
    const sourceRecord = assertRecord(record.source, `${fieldPath}.source`);
    const origin = sourceRecord.origin;
    if (origin !== 'v1' && origin !== 'v2') {
      throw new Error(`Invalid replay suite: ${fieldPath}.source.origin must be v1 or v2`);
    }
    assertOptionalString(sourceRecord.legacy_case_id, `${fieldPath}.source.legacy_case_id`);
    assertOptionalString(sourceRecord.legacy_suite_version, `${fieldPath}.source.legacy_suite_version`);
    assertOptionalString(sourceRecord.category, `${fieldPath}.source.category`);
    assertOptionalString(sourceRecord.subcategory, `${fieldPath}.source.subcategory`);
    normalizedSource = {
      origin,
      legacy_case_id: typeof sourceRecord.legacy_case_id === 'string' ? sourceRecord.legacy_case_id : undefined,
      legacy_suite_version: typeof sourceRecord.legacy_suite_version === 'string' ? sourceRecord.legacy_suite_version : undefined,
      category: typeof sourceRecord.category === 'string' ? sourceRecord.category : undefined,
      subcategory: typeof sourceRecord.subcategory === 'string' ? sourceRecord.subcategory : undefined,
    };
  }

  assertOptionalString(record.notes, `${fieldPath}.notes`);

  const normalizedCase: ReplayCase = {
    id,
    title,
    input: {
      message,
      ...(context ? { context } : {}),
      ...(Array.isArray(inputRecord.toolRequests) ? { toolRequests: inputRecord.toolRequests as ReplayCase['input']['toolRequests'] } : {}),
    },
  };

  if (record.intent_contract) normalizedCase.intent_contract = record.intent_contract as ReplayCase['intent_contract'];
  if (record.trajectory_contract) normalizedCase.trajectory_contract = record.trajectory_contract as ReplayCase['trajectory_contract'];
  if (record.evidence_contract) normalizedCase.evidence_contract = record.evidence_contract as ReplayCase['evidence_contract'];
  if (record.blocker_contract) normalizedCase.blocker_contract = record.blocker_contract as ReplayCase['blocker_contract'];
  if (record.conclusion_contract) normalizedCase.conclusion_contract = record.conclusion_contract as ReplayCase['conclusion_contract'];
  if (record.tool_execution_contract) {
    normalizedCase.tool_execution_contract = record.tool_execution_contract as ReplayCase['tool_execution_contract'];
  }
  if (record.response_contract) normalizedCase.response_contract = record.response_contract as ReplayCase['response_contract'];
  if (normalizedSource) normalizedCase.source = normalizedSource;
  if (typeof record.notes === 'string') normalizedCase.notes = record.notes;

  return normalizedCase;
}

export function validateReplaySuite(rawSuite: unknown, source = 'replay suite'): ReplaySuite {
  const suite = assertRecord(rawSuite, source);
  const version = assertString(suite.version, `${source}.version`);
  assertOptionalString(suite.description, `${source}.description`);

  if (!Array.isArray(suite.cases) || suite.cases.length === 0) {
    throw new Error(`Invalid replay suite: ${source}.cases must be a non-empty array`);
  }

  const ids = new Set<string>();
  const cases = suite.cases.map((item, index) => {
    const replayCase = validateReplayCase(item, `${source}.cases[${index}]`);
    if (ids.has(replayCase.id)) {
      throw new Error(`Invalid replay suite: duplicated case id "${replayCase.id}"`);
    }
    ids.add(replayCase.id);
    return replayCase;
  });

  return {
    version,
    description: typeof suite.description === 'string' ? suite.description : undefined,
    cases,
  };
}

export function resolveCasesPath(argPath?: string): string {
  if (argPath) {
    return path.resolve(process.cwd(), argPath);
  }
  return path.resolve(process.cwd(), 'eval/specs/replay/effect-tuning-core.v2.json');
}

export function loadSuite(casesPath: string): ReplaySuite {
  return validateReplaySuite(JSON.parse(fs.readFileSync(casesPath, 'utf-8')), casesPath);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function timestampLabel(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function runReplaySuite(
  suite: ReplaySuite,
  options: { casesPath?: string; filter?: string; log?: boolean } = {},
): ReplayRunReport {
  const filter = String(options.filter || process.env.CASE_FILTER || '').trim();
  const shouldLog = options.log !== false;
  const cases = filter
    ? suite.cases.filter((item) => item.id === filter)
    : suite.cases;

  if (cases.length === 0) {
    throw new Error(`No V2 replay cases matched filter: ${filter || '(none)'}`);
  }

  const report: ReplayRunReport = {
    summary: 'FAILED',
    timestamp: new Date().toISOString(),
    casesFile: options.casesPath || '(in-memory suite)',
    total: cases.length,
    passed: 0,
    failed: 0,
    cases: [],
  };

  for (const replayCase of cases) {
    const runtime = executeCase(replayCase.input);
    const judged = judgeReplayCase(replayCase, runtime);
    const caseReport: ReplayCaseReport = {
      id: judged.id,
      title: judged.title,
      status: judged.status,
      passed: judged.passed,
      total: judged.total,
      checks: judged.checks,
      runtime: judged.runtime,
      replySnippet: runtime.conclusion.reply.slice(0, 300),
      source: replayCase.source,
    };

    if (shouldLog) {
      console.log(`\n[${judged.id}] ${judged.title}`);
      console.log(`  mode=${runtime.mode}, firstTool=${runtime.selectedToolClasses[0] ?? 'none'}`);
      console.log(`  checks=${judged.passed}/${judged.total} -> ${judged.status}`);
      for (const check of judged.checks) {
        const mark = check.pass ? '✓' : '✗';
        console.log(`    ${mark} [${check.layer}] ${check.name}: ${check.detail}`);
      }
      console.log(`  reply=${runtime.conclusion.reply.slice(0, 160)}`);
    }

    report.cases.push(caseReport);
    if (judged.status === 'PASS') report.passed += 1;
    else report.failed += 1;
  }

  report.summary = report.failed === 0 ? 'PASS' : 'FAILED';
  return report;
}

export function saveReplayReport(
  report: ReplayRunReport,
  reportsDir = path.resolve(process.cwd(), 'eval/reports'),
  prefix = 'REPLAY',
): string {
  ensureDir(reportsDir);
  const reportPath = path.join(reportsDir, `${prefix}-${timestampLabel()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function main(): Promise<void> {
  const { casesFile } = parseArgs();
  const casesPath = resolveCasesPath(casesFile);
  const suite = loadSuite(casesPath);
  const report = runReplaySuite(suite, { casesPath, log: true });
  const reportPath = saveReplayReport(report);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`V2 Replay: ${report.summary}`);
  console.log(`Total: ${report.total}, Passed: ${report.passed}, Failed: ${report.failed}`);
  console.log(`Report saved: ${reportPath}`);
  console.log('='.repeat(60));

  process.exit(report.summary === 'PASS' ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error instanceof Error ? error.stack || error.message : error));
    process.exit(1);
  });
}
