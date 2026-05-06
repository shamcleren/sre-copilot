import fs from 'fs';
import path from 'path';
import type {
  EvidenceType,
  InvestigationMode,
  ReplayCase,
  ReplaySuite,
  ToolClass,
} from '../src/contracts';

interface V1Case {
  id: string;
  category?: string;
  subcategory?: string;
  title: string;
  prompt: string;
  context?: Record<string, unknown>;
  expect?: Record<string, unknown>;
}

interface V1Suite {
  version: string;
  description?: string;
  cases: V1Case[];
}

const PROMQL_RE = /(promql|sum\(|rate\(|avg\(|count\(|histogram_quantile\(|\{[^}]+\}\[[0-9]+[smhd]\])/i;
const DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+){2,}\b/i;
const POD_RE = /\bpod\s+[a-z0-9][a-z0-9-]+/i;
const SERVICE_RE = /看下\s+[a-z0-9-]{2,}|服务\s+[a-z0-9-]{2,}|[a-z0-9-]{2,}\s+为什么(?:异常|报错|启动失败|超时)/i;
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
  return path.resolve(__dirname, '../..');
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(): { inputPath?: string; outputPath?: string } {
  const args = process.argv.slice(2);
  const result: { inputPath?: string; outputPath?: string } = {};

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--input' && args[index + 1]) {
      result.inputPath = args[index + 1];
      index += 1;
      continue;
    }
    if (args[index] === '--output' && args[index + 1]) {
      result.outputPath = args[index + 1];
      index += 1;
    }
  }

  return result;
}

function resolveInputPath(argPath?: string): string {
  if (argPath) {
    return path.resolve(process.cwd(), argPath);
  }
  return path.resolve(repoRoot(), 'eval/effect-tuning-shared-baseline.json');
}

function resolveOutputPath(argPath?: string): string {
  if (argPath) {
    return path.resolve(process.cwd(), argPath);
  }
  return path.resolve(repoRoot(), 'v2/eval/specs/replay/effect-tuning-all.v2.json');
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);
}

function normalizeStringGroups(input: unknown): string[][] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((group) => normalizeStringArray(group))
    .filter((group) => group.length > 0);
}

function unique<T extends string>(items: T[]): T[] {
  return [...new Set(items)] as T[];
}

function inferToolClasses(toolOrClass: string): ToolClass[] {
  const name = String(toolOrClass || '').trim().toLowerCase();
  if (!name) {
    return [];
  }

  const classes = new Set<ToolClass>();
  if (name === 'unify_query' || name === 'relation' || name === 'knowledge' || name === 'k8s' || name === 'ssh') {
    classes.add(name);
  }
  if (TOOL_CLASS_MAP[name]) {
    classes.add(TOOL_CLASS_MAP[name]);
  }
  if (name.includes('query_') || name.includes('list_tag') || name.includes('list_field')) {
    classes.add('unify_query');
  }
  if (name.includes('relation')) {
    classes.add('relation');
  }
  if (name.includes('knowledge')) {
    classes.add('knowledge');
  }
  if (name.includes('k8s')) {
    classes.add('k8s');
  }
  if (name.includes('ssh')) {
    classes.add('ssh');
  }
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

function inferResponseSections(mode?: InvestigationMode): string[] {
  if (mode === 'request_evidence' || mode === 'collaborative_request') {
    return ['当前判断', '下一步'];
  }
  return ['当前判断', '已确认事实', '下一步'];
}

function inferEvidenceTypes(caseItem: V1Case, mode: InvestigationMode | undefined, preferred: ToolClass[]): EvidenceType[] {
  const types: EvidenceType[] = [];
  const prompt = caseItem.prompt;

  if (mode === 'request_evidence' || mode === 'collaborative_request') {
    types.push('gap');
  }

  if (PROMQL_RE.test(prompt)) {
    types.push('query_artifact');
  }

  if (DOMAIN_RE.test(prompt) || POD_RE.test(prompt) || SERVICE_RE.test(prompt) || Boolean(caseItem.expect?.should_resolve_service)) {
    types.push('service_resolution');
  }

  if ((mode === 'continue_investigation' || mode === 'collaborative_request') && preferred.includes('unify_query')) {
    types.push('runtime_signal');
  }

  return unique(types);
}

function buildSemanticCriteria(caseItem: V1Case): string[] {
  const expect = caseItem.expect || {};
  const criteria: string[] = [];
  const entityTypes = normalizeStringArray(expect.entity_types);
  const firstTry = unique(normalizeStringArray(expect.first_try_tool_classes).flatMap(inferToolClasses));
  const fallback = unique(normalizeStringArray(expect.fallback_tool_classes).flatMap(inferToolClasses));

  if (expect.should_verify_before_conclude) {
    criteria.push('回复应先验证时间范围、查询、数据源或指标，再判断现象是否真实，不应直接下最终结论。');
  }

  if (expect.should_stitch_entities) {
    criteria.push(
      entityTypes.length > 0
        ? `回复应体现实体关联排查思路，明确串联 ${entityTypes.join(' / ')}。`
        : '回复应体现实体关联排查思路，而不是只停留在单点现象。');
  }

  if (firstTry.length > 0 || fallback.length > 0) {
    criteria.push(
      `首跳应优先尝试 ${firstTry.join(' / ') || 'telemetry-first'}，仅在证据不足时再考虑 ${fallback.join(' / ') || '更重型工具'}。`,
    );
  }

  if (typeof expect.notes === 'string' && expect.notes.trim()) {
    criteria.push(`迁移备注：${expect.notes.trim()}`);
  }

  return criteria;
}

function buildNotes(caseItem: V1Case): string | undefined {
  const parts = [
    caseItem.category ? `category=${caseItem.category}` : '',
    caseItem.subcategory ? `subcategory=${caseItem.subcategory}` : '',
    typeof caseItem.expect?.notes === 'string' ? String(caseItem.expect.notes).trim() : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

function withDefinedKeys<T extends Record<string, unknown>>(input: T): T | undefined {
  const entries = Object.entries(input).filter(([, value]) => {
    if (value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries) as T;
}

function migrateCase(caseItem: V1Case, suiteVersion: string): ReplayCase {
  const expect = caseItem.expect || {};
  const expectedMode = mapActionToMode(expect.action);
  const mustNotMode = mapActionToMode(expect.must_not_action);
  const preferredFirstToolClasses = unique([
    ...normalizeStringArray(expect.preferred_tool_classes).flatMap(inferToolClasses),
    ...normalizeStringArray(expect.first_try_tool_classes).flatMap(inferToolClasses),
  ]);
  const forbiddenFirstToolClasses = unique([
    ...normalizeStringArray(expect.must_not_first_tool).flatMap(inferToolClasses),
    ...normalizeStringArray(expect.should_not_call_tools).flatMap(inferToolClasses),
    ...normalizeStringArray(expect.fallback_tool_classes).flatMap(inferToolClasses),
  ]);
  const evidenceTypes = inferEvidenceTypes(caseItem, expectedMode, preferredFirstToolClasses);
  const semanticCriteria = buildSemanticCriteria(caseItem);
  const maxReplyLength = typeof expect.max_reply_length === 'number'
    ? expect.max_reply_length
    : undefined;

  return {
    id: caseItem.id,
    title: caseItem.title,
    input: {
      message: caseItem.prompt,
      context: caseItem.context,
    },
    intent_contract: withDefinedKeys({
      expected_mode: expectedMode,
      must_not_mode: mustNotMode ? [mustNotMode] : undefined,
    }),
    trajectory_contract: withDefinedKeys({
      preferred_first_tool_classes: preferredFirstToolClasses,
      forbidden_first_tool_classes: forbiddenFirstToolClasses,
    }),
    evidence_contract: withDefinedKeys({
      must_have_all: evidenceTypes,
      must_not_be_knowledge_only: expectedMode === 'continue_investigation' && preferredFirstToolClasses.length > 0,
    }),
    response_contract: withDefinedKeys({
      semantic_criteria: semanticCriteria,
      must_include_sections: inferResponseSections(expectedMode),
      must_contain_keywords: normalizeStringArray(expect.must_contain),
      must_contain_any_groups: normalizeStringGroups(expect.must_contain_any),
      must_not_contain_keywords: normalizeStringArray(expect.must_not_contain),
      must_not_be_generic_manual: expect.must_not_contain_long_manual === true,
      max_reply_length: maxReplyLength,
    }),
    source: {
      origin: 'v1',
      legacy_case_id: caseItem.id,
      legacy_suite_version: suiteVersion,
      category: caseItem.category,
      subcategory: caseItem.subcategory,
    },
    notes: buildNotes(caseItem),
  };
}

function main(): void {
  const { inputPath, outputPath } = parseArgs();
  const resolvedInput = resolveInputPath(inputPath);
  const resolvedOutput = resolveOutputPath(outputPath);
  const sourceSuite = JSON.parse(fs.readFileSync(resolvedInput, 'utf-8')) as V1Suite;
  const migratedCases = sourceSuite.cases.map((caseItem) => migrateCase(caseItem, sourceSuite.version));
  const migratedSuite: ReplaySuite = {
    version: `2.0-migrated-from-${sourceSuite.version}`,
    description: `从 ${path.relative(repoRoot(), resolvedInput)} 自动迁移的 V2 replay suite，保留 legacy case ID 作为并行对比键。`,
    cases: migratedCases,
  };

  ensureDir(path.dirname(resolvedOutput));
  fs.writeFileSync(resolvedOutput, JSON.stringify(migratedSuite, null, 2));

  console.log(`Migrated ${migratedCases.length} cases`);
  console.log(`Input : ${resolvedInput}`);
  console.log(`Output: ${resolvedOutput}`);
}

main();
