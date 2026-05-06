import fs from 'fs';
import path from 'path';
import {
  getLlmCallLogStats,
  getLlmCallPhaseBreakdown,
  getTokenUsagePhaseBreakdown,
  getToolCallLogStats,
  getToolExecutionBreakdown,
  getV2RouteRuntimeSummary,
  initDatabase,
  isDatabaseAvailable,
  type LlmCallPhaseBreakdown,
  type TokenUsagePhaseBreakdown,
  type ToolExecutionBreakdownItem,
  type V2RouteRuntimeSummary,
} from '../../src/observability/legacy-v1-observability';

interface CompareSummary {
  total: number;
  sharedCases: number;
  improved: number;
  regressed: number;
  parityPass: number;
  parityFail: number;
  v1Missing: number;
  modeAligned: number;
  firstToolAligned: number;
}

type CompareDelta = 'improved' | 'regressed' | 'parity-pass' | 'parity-fail' | 'v1-missing';

interface CompareCase {
  id: string;
  title: string;
  delta: CompareDelta;
  v1Status: string;
  v2Status: string;
  v1Phase: string;
  v2Mode: string;
  v1FirstToolClass: string;
  v2FirstToolClass: string;
  firstToolAligned: boolean;
  modeAlignedToExpectation?: boolean;
  v1PassedChecks: number;
  v2PassedChecks: number;
  v1TotalChecks: number;
  v2TotalChecks: number;
  v1ReplyLength: number;
  v2ReplyLength: number;
}

interface CompareReport {
  timestamp: string;
  paths: {
    v1CasesPath: string;
    v1ReportPath: string;
    v2CasesPath: string;
  };
  v1Summary: {
    summary: string;
    total: number;
    passed: number;
    failed: number;
  };
  v2Summary: {
    summary: string;
    total: number;
    passed: number;
    failed: number;
  };
  summary: CompareSummary;
  comparisons: CompareCase[];
}

interface ReplayReport {
  summary: string;
  timestamp: string;
  casesFile: string;
  total: number;
  passed: number;
  failed: number;
}

interface RoadmapItem {
  text: string;
  checked: boolean;
  indent: number;
}

type GateStatus = '通过' | '进行中' | '阻塞' | '未知';

interface GateView {
  name: string;
  status: GateStatus;
  detail: string;
}

interface RuntimePhaseView {
  phase: 'intentInference' | 'toolPlanning' | 'replyGeneration';
  label: string;
  llmCalls: number;
  requestCount: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgPromptChars: number;
  avgSystemPromptChars: number;
  avgUserPromptChars: number;
  maxPromptChars: number;
  topModel: string;
}

interface RuntimeObservabilitySummary {
  databaseAvailable: boolean;
  samplingWindowDays: number;
  windowStart: string;
  windowEnd: string;
  llmStats: Awaited<ReturnType<typeof getLlmCallLogStats>>;
  llmPhases: LlmCallPhaseBreakdown[];
  tokenPhases: TokenUsagePhaseBreakdown[];
  toolStats: Awaited<ReturnType<typeof getToolCallLogStats>>;
  toolBreakdown: ToolExecutionBreakdownItem[];
  phaseViews: RuntimePhaseView[];
  globalLlmPhaseReady: boolean;
  v2RouteRuntime: V2RouteRuntimeSummary;
  performanceReady: boolean;
}

interface CompareHighlights {
  improvedCases: CompareCase[];
  regressedCases: CompareCase[];
  parityFailCases: CompareCase[];
  watchlistCases: CompareCase[];
}

function repoRoot(): string {
  return path.resolve(__dirname, '../../..');
}

function timestampLabel(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function latestFile(directory: string, pattern: RegExp): string {
  const matches = fs
    .readdirSync(directory)
    .filter((file) => pattern.test(file))
    .sort();

  if (matches.length === 0) {
    throw new Error(`No files matched ${pattern} in ${directory}`);
  }

  return path.join(directory, matches[matches.length - 1]);
}

function latestOptionalFile(directory: string, pattern: RegExp): string | undefined {
  if (!fs.existsSync(directory)) {
    return undefined;
  }

  const matches = fs
    .readdirSync(directory)
    .filter((file) => pattern.test(file))
    .sort();

  if (matches.length === 0) {
    return undefined;
  }

  return path.join(directory, matches[matches.length - 1]);
}

function latestFileFromDirectories(directories: string[], pattern: RegExp): string {
  const matches = directories.flatMap((directory) => {
    if (!fs.existsSync(directory)) {
      return [] as string[];
    }
    return fs
      .readdirSync(directory)
      .filter((file) => pattern.test(file))
      .map((file) => path.join(directory, file));
  });

  if (matches.length === 0) {
    throw new Error(`No files matched ${pattern} in ${directories.join(', ')}`);
  }

  return matches
    .map((filePath) => ({
      filePath,
      mtimeMs: fs.statSync(filePath).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].filePath;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function extractP11Roadmap(todoContent: string): RoadmapItem[] {
  const marker = '### P11 V2 替换 V1 迁移路线';
  const start = todoContent.indexOf(marker);
  if (start < 0) {
    return [];
  }

  const afterStart = todoContent.slice(start + marker.length);
  const nextSectionIndex = afterStart.indexOf('\n### ');
  const section = nextSectionIndex >= 0 ? afterStart.slice(0, nextSectionIndex) : afterStart;

  return section
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*)- \[(x| )\] (.+)$/);
      if (!match) return null;
      return {
        indent: match[1].length,
        checked: match[2] === 'x',
        text: match[3].trim(),
      } satisfies RoadmapItem;
    })
    .filter((item): item is RoadmapItem => Boolean(item));
}

function toGate(status: GateStatus, detail: string): Pick<GateView, 'status' | 'detail'> {
  return { status, detail };
}

function yesNo(value: boolean): string {
  return value ? '是' : '否';
}

function passState(value: boolean): string {
  return value ? '通过' : '未通过';
}

function compatVerifyState(passed: boolean, attempted: boolean): string {
  if (passed) {
    return '通过';
  }
  return attempted ? '未通过' : '未执行';
}

function emptyCompareSummary(): CompareSummary {
  return {
    total: 0,
    sharedCases: 0,
    improved: 0,
    regressed: 0,
    parityPass: 0,
    parityFail: 0,
    v1Missing: 0,
    modeAligned: 0,
    firstToolAligned: 0,
  };
}

const MIGRATION_TASK_MARKER = '持续迁移 `V1` 经验到 `V2`';
const FINAL_CUT_TASK_MARKER = '满足门槛后执行最终切换';
const CONTRACT_HARDENING_SIGNAL_MARKERS = [
  '扩展 `V2` adapter 合同',
  '为 adapter 失败语义做统一归一',
  '明确替换门槛',
] as const;

function isMigrationTask(item: RoadmapItem): boolean {
  return item.text.includes(MIGRATION_TASK_MARKER);
}

function isFinalCutTask(item: RoadmapItem): boolean {
  return item.text.includes(FINAL_CUT_TASK_MARKER);
}

export function strictCompareReady(compare?: CompareReport | null): boolean {
  if (!compare) {
    return false;
  }
  return compare.summary.regressed === 0 && compare.summary.sharedCases > 0;
}

export function runtimePhaseCoverageReady(runtime: Pick<RuntimeObservabilitySummary, 'phaseViews' | 'toolStats' | 'toolBreakdown'>): boolean {
  const hasAllLlmPhaseCoverage = runtime.phaseViews.every((phase) => phase.llmCalls > 0 || phase.totalTokens > 0);
  const hasToolCoverage = runtime.toolStats.totalCalls > 0 || runtime.toolBreakdown.length > 0;
  return hasAllLlmPhaseCoverage && hasToolCoverage;
}

export function v2RouteRuntimeReady(summary: Pick<V2RouteRuntimeSummary, 'totalAttempts' | 'handledV2Count' | 'intentPhaseSamples' | 'intentLlmEnabledSamples' | 'v2RuntimeSamples' | 'toolExecutionSamples'>): boolean {
  return summary.totalAttempts > 0
    && summary.handledV2Count > 0
    && summary.intentPhaseSamples > 0
    && summary.intentLlmEnabledSamples > 0
    && summary.v2RuntimeSamples > 0
    && summary.toolExecutionSamples > 0;
}

function routeAndFallbackReady(roadmapItems: RoadmapItem[]): boolean {
  return roadmapItems.some((item) => item.checked && item.text.includes('将 `V2` 接入灰度主入口'))
    && roadmapItems.some((item) => item.checked && item.text.includes('灰度入口已补齐可回滚机制与运行态标识'));
}

function acceptanceMatrixReady(roadmapItems: RoadmapItem[]): boolean {
  return roadmapItems.some((item) => item.checked && item.text.includes('建立 `V2` 真实场景验收矩阵'));
}

export function pureV2BaselineReady(params: {
  coreVerifyPassed: boolean;
  replay: ReplayReport;
  roadmapItems: RoadmapItem[];
  runtimeObservability: Pick<RuntimeObservabilitySummary, 'performanceReady'>;
}): boolean {
  const { coreVerifyPassed, replay, roadmapItems, runtimeObservability } = params;
  const coreReady = coreVerifyPassed && replay.summary === 'PASS';
  return coreReady
    && routeAndFallbackReady(roadmapItems)
    && acceptanceMatrixReady(roadmapItems)
    && contractHardeningReady({ roadmapItems, replay })
    && runtimeObservability.performanceReady;
}

export function contractHardeningReady(params: {
  roadmapItems: RoadmapItem[];
  replay: ReplayReport;
}): boolean {
  const { roadmapItems, replay } = params;
  return replay.summary === 'PASS' && CONTRACT_HARDENING_SIGNAL_MARKERS.every((marker) => roadmapItems.some((item) => item.checked && item.text.includes(marker)));
}

export function buildCurrentStage(pendingTopLevel: RoadmapItem[]): string {
  if (pendingTopLevel.some(isMigrationTask)) {
    return '迁移门槛固化 + V1 经验持续迁移';
  }
  if (pendingTopLevel.some(isFinalCutTask)) {
    return '切主入口前最终验收';
  }
  return 'V2 已接管主入口，进入替换后观测';
}

export function buildAcceptanceStatus(params: {
  coreVerifyPassed: boolean;
  replay: ReplayReport;
  pendingTopLevel: RoadmapItem[];
}): '未开始' | '进行中' | '已具备验收条件' | '验收通过' | '验收失败/阻塞' {
  const { coreVerifyPassed, replay, pendingTopLevel } = params;
  if (!coreVerifyPassed || replay.summary !== 'PASS') {
    return '验收失败/阻塞';
  }

  if (pendingTopLevel.length === 0) {
    return '验收通过';
  }

  const onlyFinalCutPending = pendingTopLevel.length > 0 && pendingTopLevel.every(isFinalCutTask);
  if (onlyFinalCutPending) {
    return '已具备验收条件';
  }

  return '进行中';
}

function formatTopModel(llmPhase?: LlmCallPhaseBreakdown): string {
  const top = llmPhase?.byModel?.[0];
  if (!top || !top.model) {
    return '未采集';
  }
  const taskTypeSuffix = top.taskType ? ` / ${top.taskType}` : '';
  return `${top.model} (${top.requestType}${taskTypeSuffix})`;
}

function buildRuntimePhaseViews(runtime: {
  llmPhases: LlmCallPhaseBreakdown[];
  tokenPhases: TokenUsagePhaseBreakdown[];
}): RuntimePhaseView[] {
  const phaseOrder: Array<RuntimePhaseView['phase']> = ['intentInference', 'toolPlanning', 'replyGeneration'];
  const phaseLabels: Record<RuntimePhaseView['phase'], string> = {
    intentInference: '意图识别',
    toolPlanning: '工具规划',
    replyGeneration: '回答生成',
  };

  return phaseOrder.map((phase) => {
    const llmPhase = runtime.llmPhases.find((item) => item.phase === phase);
    const tokenPhase = runtime.tokenPhases.find((item) => item.phase === phase);
    return {
      phase,
      label: phaseLabels[phase],
      llmCalls: llmPhase?.totalCalls || 0,
      requestCount: tokenPhase?.requestCount || llmPhase?.totalCalls || 0,
      successCalls: llmPhase?.successCalls || 0,
      errorCalls: llmPhase?.errorCalls || 0,
      avgLatencyMs: llmPhase?.avgLatencyMs || 0,
      maxLatencyMs: llmPhase?.maxLatencyMs || 0,
      promptTokens: tokenPhase?.promptTokens || 0,
      completionTokens: tokenPhase?.completionTokens || 0,
      totalTokens: tokenPhase?.totalTokens || llmPhase?.totalTokens || 0,
      avgPromptChars: tokenPhase?.avgPromptChars || 0,
      avgSystemPromptChars: tokenPhase?.avgSystemPromptChars || 0,
      avgUserPromptChars: tokenPhase?.avgUserPromptChars || 0,
      maxPromptChars: tokenPhase?.maxPromptChars || 0,
      topModel: formatTopModel(llmPhase),
    };
  });
}

async function collectRuntimeObservability(): Promise<RuntimeObservabilitySummary> {
  const samplingWindowDays = 14;
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - samplingWindowDays * 24 * 60 * 60 * 1000);

  await initDatabase().catch(() => null);
  const databaseAvailable = isDatabaseAvailable();

  if (!databaseAvailable) {
    return {
      databaseAvailable: false,
      samplingWindowDays,
      windowStart: startDate.toISOString(),
      windowEnd: endDate.toISOString(),
      llmStats: { totalCalls: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0, totalTokens: 0, topModels: [], todayCalls: 0 },
      llmPhases: [],
      tokenPhases: [],
      toolStats: { totalCalls: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0, topTools: [], todayCalls: 0 },
      toolBreakdown: [],
      phaseViews: buildRuntimePhaseViews({ llmPhases: [], tokenPhases: [] }),
      globalLlmPhaseReady: false,
      v2RouteRuntime: {
        databaseAvailable: false,
        totalAttempts: 0,
        eligibleCount: 0,
        handledV2Count: 0,
        fallbackCount: 0,
        streamCount: 0,
        intentPhaseSamples: 0,
        intentLlmEnabledSamples: 0,
        v2RuntimeSamples: 0,
        toolExecutionSamples: 0,
        avgIntentInferMs: 0,
        avgV2RouteMs: 0,
        modes: [],
      },
      performanceReady: false,
    };
  }

  const [llmStats, llmPhases, tokenPhases, toolStats, toolBreakdown, v2RouteRuntime] = await Promise.all([
    getLlmCallLogStats(),
    getLlmCallPhaseBreakdown({ startDate: startDate.toISOString(), endDate: endDate.toISOString() }),
    getTokenUsagePhaseBreakdown({ startDate, endDate }),
    getToolCallLogStats(),
    getToolExecutionBreakdown(5),
    getV2RouteRuntimeSummary({ startDate, endDate }),
  ]);

  const phaseViews = buildRuntimePhaseViews({ llmPhases, tokenPhases });
  const globalLlmPhaseReady = runtimePhaseCoverageReady({ phaseViews, toolStats, toolBreakdown });

  return {
    databaseAvailable,
    samplingWindowDays,
    windowStart: startDate.toISOString(),
    windowEnd: endDate.toISOString(),
    llmStats,
    llmPhases,
    tokenPhases,
    toolStats,
    toolBreakdown,
    phaseViews,
    globalLlmPhaseReady,
    v2RouteRuntime,
    performanceReady: v2RouteRuntimeReady(v2RouteRuntime),
  };
}

function buildCompareHighlights(compare?: CompareReport | null): CompareHighlights {
  if (!compare) {
    return {
      improvedCases: [],
      regressedCases: [],
      parityFailCases: [],
      watchlistCases: [],
    };
  }

  const improvedCases = compare.comparisons.filter((item) => item.delta === 'improved').slice(0, 5);
  const regressedCases = compare.comparisons.filter((item) => item.delta === 'regressed').slice(0, 5);
  const parityFailCases = compare.comparisons.filter((item) => item.delta === 'parity-fail').slice(0, 5);
  const watchlistCases = compare.comparisons
    .filter((item) => item.delta === 'parity-pass' && (!item.firstToolAligned || item.v1FirstToolClass !== item.v2FirstToolClass))
    .sort((a, b) => {
      const alignmentDelta = Number(a.firstToolAligned) - Number(b.firstToolAligned);
      if (alignmentDelta !== 0) return alignmentDelta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, 5);

  return {
    improvedCases,
    regressedCases,
    parityFailCases,
    watchlistCases,
  };
}

function buildGateViews(params: {
  coreVerifyPassed: boolean;
  compareVerifyPassed: boolean;
  compare?: CompareReport | null;
  replay: ReplayReport;
  roadmapItems: RoadmapItem[];
  runtimeObservability: RuntimeObservabilitySummary;
  v2BaselineReady: boolean;
  canExpandGray: boolean;
  canCutMainRoute: boolean;
}): GateView[] {
  const {
    coreVerifyPassed,
    compareVerifyPassed,
    compare,
    replay,
    roadmapItems,
    runtimeObservability,
    v2BaselineReady,
    canExpandGray,
    canCutMainRoute,
  } = params;
  const topLevelPending = roadmapItems.filter((item) => item.indent === 0 && !item.checked);
  const routeAndFallbackCovered = routeAndFallbackReady(roadmapItems);
  const matrixCovered = acceptanceMatrixReady(roadmapItems);
  const readinessClarified = topLevelPending.every((item) => !item.text.includes('明确替换门槛'));
  const contractReady = contractHardeningReady({ roadmapItems, replay });
  const coreReady = coreVerifyPassed && replay.summary === 'PASS';
  const compatReady = strictCompareReady(compare);
  const missingPhases = runtimeObservability.phaseViews
    .filter((item) => item.llmCalls === 0 && item.totalTokens === 0)
    .map((item) => item.phase);
  const routeRuntime = runtimeObservability.v2RouteRuntime;
  const performanceDetail = !runtimeObservability.databaseAvailable
    ? '状态报告已接入 DB-backed phase stats，但当前数据库不可用，暂未采到显式 `V2` 路由的真实运行态样本。'
    : runtimeObservability.performanceReady
      ? `近 ${runtimeObservability.samplingWindowDays} 天显式 V2 样本 total=${routeRuntime.totalAttempts}、handled=${routeRuntime.handledV2Count}、fallback=${routeRuntime.fallbackCount}；intentInference 平均 ${routeRuntime.avgIntentInferMs}ms，V2 runtime 平均 ${routeRuntime.avgV2RouteMs}ms，含工具执行样本 ${routeRuntime.toolExecutionSamples} 条。`
      : `显式 V2 样本仍不足：total=${routeRuntime.totalAttempts}、handled=${routeRuntime.handledV2Count}、intentPhase=${routeRuntime.intentPhaseSamples}、intentLLM=${routeRuntime.intentLlmEnabledSamples}、v2Runtime=${routeRuntime.v2RuntimeSamples}、toolExecution=${routeRuntime.toolExecutionSamples}；全局 LLM phase 参考缺失=${missingPhases.length > 0 ? missingPhases.join(' / ') : '无'}。`;
  const baselineBlockers = [
    ...(coreReady ? [] : ['纯 `V2` core gate 未全绿']),
    ...(routeAndFallbackCovered ? [] : ['主入口 route metadata / fallback 尚未固化']),
    ...(matrixCovered ? [] : ['真实场景验收矩阵尚未固化']),
    ...(contractReady ? [] : ['高价值 contract 仍未全部纳入固定回放门禁']),
    ...(runtimeObservability.performanceReady ? [] : ['显式 `V2` 路由运行态样本仍不足']),
    ...(topLevelPending.length > 0 ? ['顶层迁移项仍未全部关闭'] : []),
  ];
  const replaceabilityDetail = canCutMainRoute
    ? '纯 `V2` baseline 已通过，且顶层迁移项已清零，可准备切主入口；历史 compare 结果继续保留为跨版本 oracle 观察视角。'
    : canExpandGray
      ? '纯 `V2` baseline 已通过，可继续扩大灰度；仍有顶层迁移项未关闭，暂不建议直接切主入口。'
      : `当前仍未满足纯 V2 baseline：${baselineBlockers.join('；')}。`;

  return [
    {
      name: 'V2 core gate 状态',
      ...(coreReady
        ? toGate('通过', '本轮 core gate 已通过，纯 `V2` typecheck / runtime / smoke 已形成独立守门。')
        : !coreVerifyPassed
          ? toGate('阻塞', '本轮 core gate 未通过，纯 `V2` typecheck / runtime / smoke 门禁未全绿。')
          : toGate('阻塞', `最新 replay=${replay.summary}，${replay.passed}/${replay.total} 通过，core gate 尚未形成稳定闭环。`)),
    },
    {
      name: '纯 V2 baseline 状态',
      ...(v2BaselineReady
        ? toGate('通过', '纯 `V2` baseline 已通过：core / route metadata / fallback / contract / 运行态样本 均已形成独立 readiness 判据。')
        : coreReady
          ? toGate('进行中', `纯 V2 baseline 仍在收敛：${baselineBlockers.join('；')}。`)
          : toGate('阻塞', `纯 V2 baseline 尚未建立：${baselineBlockers.join('；')}。`)),
    },
    {
      name: 'V2 replay / regression 状态',
      ...(replay.summary === 'PASS'
        ? toGate(coreVerifyPassed ? '通过' : '进行中', `最新 replay=${replay.summary}，${replay.passed}/${replay.total} 通过；纯 V2 replay / regression 已与历史 compare 观察层解耦。`)
        : toGate('阻塞', `最新 replay=${replay.summary}，${replay.passed}/${replay.total} 通过，本轮 pure V2 回归仍未全绿。`)),
    },
    {
      name: '历史 compare 观察状态',
      ...(compatReady
        ? toGate('通过', compareVerifyPassed
          ? '本轮 compare 观察结果保持通过；主入口 route regression 与历史 baseline compare 当前保持一致，但该结果仅作为观察视角。'
          : '最近 compare 产物保持通过；当前 compare 结果作为历史 baseline 观察项保留，本次状态刷新未重新执行 compare。')
        : compare
          ? toGate('进行中', '最近 compare 仍提示与历史 baseline 存在差异，需要继续盯防，但不再阻断纯 `V2` baseline 判定。')
          : toGate('进行中', '当前尚无最新 compare 产物；该观察项可按需执行 `npm run runtime:compare` 补齐。')),
    },
    {
      name: '主入口回滚观测状态',
      ...(routeAndFallbackCovered
        ? toGate('通过', '主入口异常回滚路径与运行态标识已固化，可独立支撑纯 `V2` baseline 的回滚观测。')
        : toGate('阻塞', '回滚机制或回滚观测仍未固化。')),
    },
    {
      name: 'route metadata / observability 状态',
      ...(routeAndFallbackCovered
        ? toGate('通过', '`routeMetadata / v2RuntimeObservability` 已覆盖主入口命中与回退路径。')
        : toGate('进行中', '主入口 metadata 尚未完成闭环。')),
    },
    {
      name: 'strict compare 状态',
      ...(strictCompareReady(compare)
        ? toGate('通过', `最新 compare：shared=${compare?.summary.sharedCases || 0}，improved=${compare?.summary.improved || 0}，regressed=0，parity-pass=${compare?.summary.parityPass || 0}；当前作为跨版本 oracle 对齐参考。`)
        : !compare
          ? toGate('进行中', '尚无最新 compare 产物；该观察项可按需执行 `npm run runtime:compare` 生成。')
          : compare.summary.regressed > 0
          ? toGate('进行中', `最新 compare 仍有 regression=${compare.summary.regressed}；说明跨版本 oracle 仍有差异，需要继续盯防，但不再阻断纯 V2 baseline 判定。`)
          : toGate('进行中', `最新 compare 的 shared=${compare.summary.sharedCases}，共享 case 仍不足；当前仅影响跨版本对齐分析，不再作为纯 V2 readiness 主门槛。`)),
    },
    {
      name: '替换判定状态',
      ...(canCutMainRoute
        ? toGate('通过', replaceabilityDetail)
        : canExpandGray
          ? toGate('进行中', replaceabilityDetail)
          : toGate('阻塞', replaceabilityDetail)),
    },
    {
      name: 'failure semantics 状态',
      ...(matrixCovered
        ? toGate('通过', '空结果、超时、鉴权失败、权限阻塞已纳入 blocker 语义与回归矩阵。')
        : toGate('进行中', '失败语义尚未固化到统一矩阵。')),
    },
    {
      name: 'contract 硬化状态',
      ...(contractReady
        ? toGate('通过', '`blocker / evidence / conclusion / tool execution result` 已纳入 replay contract、judge 与 suite 校验。')
        : toGate('进行中', '高价值 contract 仍未全部纳入固定回放门禁或最新 replay 尚未通过。')),
    },
    {
      name: '文档一致性状态',
      ...(readinessClarified
        ? toGate('通过', '验收矩阵、readiness checklist、状态视图与 README/LOCAL-DEV-GUIDE/Makefile 入口已对齐。')
        : toGate('进行中', '替换门槛与文档化判据仍需进一步明确。')),
    },
    {
      name: '性能拆账状态',
      ...(runtimeObservability.performanceReady
        ? toGate('通过', performanceDetail)
        : toGate('进行中', performanceDetail)),
    },
  ];
}

function markdownTable(rows: GateView[]): string {
  const header = ['| 维度 | 状态 | 说明 |', '|------|------|------|'];
  const body = rows.map((row) => `| ${row.name} | ${row.status} | ${row.detail.replace(/\|/g, '\\|')} |`);
  return [...header, ...body].join('\n');
}

function summarizePhaseHotspots(rows: RuntimePhaseView[]): {
  slowest: string;
  heaviestPrompt: string;
} {
  const sampledRows = rows.filter((row) => row.requestCount > 0 || row.llmCalls > 0 || row.totalTokens > 0);
  if (sampledRows.length === 0) {
    return {
      slowest: '暂无可用 phase 样本。',
      heaviestPrompt: '暂无可用 prompt 样本。',
    };
  }

  const slowest = [...sampledRows].sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)[0];
  const heaviestPrompt = [...sampledRows].sort((a, b) => b.avgPromptChars - a.avgPromptChars)[0];
  return {
    slowest: `${slowest.label}：avg=${slowest.avgLatencyMs}ms，max=${slowest.maxLatencyMs}ms，成功/失败=${slowest.successCalls}/${slowest.errorCalls}`,
    heaviestPrompt: `${heaviestPrompt.label}：avgPrompt=${heaviestPrompt.avgPromptChars} chars（system=${heaviestPrompt.avgSystemPromptChars} / user=${heaviestPrompt.avgUserPromptChars}），max=${heaviestPrompt.maxPromptChars} chars`,
  };
}

function markdownRuntimePhaseTable(rows: RuntimePhaseView[]): string {
  const header = [
    '| 阶段 | 请求数 | 成功/失败 | 平均耗时(ms) | 最大耗时(ms) | Prompt/Completion/Total Tokens | 平均 Prompt/System/User 字符 | 峰值 Prompt 字符 | Top Model |',
    '|------|--------|-----------|--------------|--------------|--------------------------------|------------------------------|-------------------|-----------|',
  ];
  const body = rows.map((row) => `| ${row.label} | ${row.requestCount} | ${row.successCalls}/${row.errorCalls} | ${row.avgLatencyMs} | ${row.maxLatencyMs} | ${row.promptTokens}/${row.completionTokens}/${row.totalTokens} | ${row.avgPromptChars}/${row.avgSystemPromptChars}/${row.avgUserPromptChars} | ${row.maxPromptChars} | ${row.topModel.replace(/\|/g, '\\|')} |`);
  return [...header, ...body].join('\n');
}

function markdownToolBreakdownTable(rows: ToolExecutionBreakdownItem[]): string {
  const header = [
    '| Tool | Kind | 调用数 | 平均耗时(ms) | 最大耗时(ms) | 成功/失败 |',
    '|------|------|--------|--------------|--------------|-----------|',
  ];
  const body = rows.map((row) => `| ${row.toolName.replace(/\|/g, '\\|')} | ${row.toolKind.replace(/\|/g, '\\|')} | ${row.totalCalls} | ${row.avgLatencyMs} | ${row.maxLatencyMs} | ${row.successCalls}/${row.errorCalls} |`);
  return [...header, ...body].join('\n');
}

function formatCaseLine(item: CompareCase): string {
  return `- ${item.id} ${item.title}：delta=${item.delta}，mode=${item.v2Mode}，首个工具类 ${item.v1FirstToolClass} -> ${item.v2FirstToolClass}，checks=${item.v2PassedChecks}/${item.v2TotalChecks}`;
}

function mainBlockers(params: {
  pendingTopLevel: RoadmapItem[];
  runtimeObservability: RuntimeObservabilitySummary;
  coreReady: boolean;
  routeAndFallbackCovered: boolean;
  matrixCovered: boolean;
  contractReady: boolean;
}): string[] {
  const blockers = [...params.pendingTopLevel.map((item) => item.text)];
  if (!params.coreReady) {
    blockers.push('纯 `V2` core gate 仍未全绿，typecheck / runtime / smoke / replay 尚未形成独立稳定门槛。');
  }
  if (!params.routeAndFallbackCovered) {
    blockers.push('主入口 route metadata / fallback 守门仍未完全固化，纯 `V2` baseline 尚未闭环。');
  }
  if (!params.matrixCovered) {
    blockers.push('真实场景验收矩阵仍未全部固化，纯 `V2` readiness 判据仍有缺口。');
  }
  if (!params.contractReady) {
    blockers.push('高价值 contract 仍未全部纳入固定回放门禁，纯 `V2` baseline 还不够稳。');
  }
  if (!params.runtimeObservability.performanceReady) {
    blockers.push('显式 `V2` 路由运行态样本仍不足，intentInference / V2 runtime / tool execution 观测未稳定。');
  }
  return blockers;
}

async function main(): Promise<void> {
  const fullVerifyPassed = process.argv.includes('--verify-passed');
  const coreVerifyPassed = fullVerifyPassed || process.argv.includes('--core-verify-passed');
  const compareVerifyAttempted = fullVerifyPassed
    || process.argv.includes('--compare-verify-attempted')
    || process.argv.includes('--compare-verify-passed')
    || process.argv.includes('--compat-verify-attempted')
    || process.argv.includes('--compat-verify-passed');
  const compareVerifyPassed = fullVerifyPassed
    || process.argv.includes('--compare-verify-passed')
    || process.argv.includes('--compat-verify-passed');
  const root = repoRoot();
  const comparePath = latestOptionalFile(path.join(root, 'v2/eval/reports'), /^COMPARE-.*\.json$/i);
  const replayPath = latestFileFromDirectories([
    path.join(root, 'eval/reports'),
    path.join(root, 'v2/eval/reports'),
  ], /^REPLAY-.*\.json$/i);
  const compare = comparePath ? readJsonFile<CompareReport>(comparePath) : null;
  const replay = readJsonFile<ReplayReport>(replayPath);
  const roadmapItems = extractP11Roadmap(fs.readFileSync(path.join(root, 'TODO.MD'), 'utf-8'));
  const checkedCount = roadmapItems.filter((item) => item.checked).length;
  const pendingTopLevel = roadmapItems.filter((item) => item.indent === 0 && !item.checked);
  const runtimeObservability = await collectRuntimeObservability();
  const acceptanceStatus = buildAcceptanceStatus({ coreVerifyPassed, replay, pendingTopLevel });
  const coreReady = coreVerifyPassed && replay.summary === 'PASS';
  const compatReady = strictCompareReady(compare);
  const routeAndFallbackCovered = routeAndFallbackReady(roadmapItems);
  const matrixCovered = acceptanceMatrixReady(roadmapItems);
  const contractReady = contractHardeningReady({ roadmapItems, replay });
  const v2BaselineReady = pureV2BaselineReady({
    coreVerifyPassed,
    replay,
    roadmapItems,
    runtimeObservability,
  });
  const canExpandGray = v2BaselineReady;
  const canCutMainRoute = v2BaselineReady && pendingTopLevel.length === 0;
  const gateViews = buildGateViews({
    coreVerifyPassed,
    compareVerifyPassed,
    compare,
    replay,
    roadmapItems,
    runtimeObservability,
    v2BaselineReady,
    canExpandGray,
    canCutMainRoute,
  });
  const compareHighlights = buildCompareHighlights(compare);
  const highestRisk = migrationInProgress(pendingTopLevel)
    ? 'V1 有效经验尚未完全迁入 V2，`playbooks / policies / contracts` 覆盖仍可能出现真实线上漏口。'
    : '切主入口后的回滚与观测口径仍需持续盯防。';
  const blockers = mainBlockers({
    pendingTopLevel,
    runtimeObservability,
    coreReady,
    routeAndFallbackCovered,
    matrixCovered,
    contractReady,
  });

  const report = {
    timestamp: new Date().toISOString(),
    overall: {
      currentStage: buildCurrentStage(pendingTopLevel),
      acceptanceStatus,
      canExpandGray,
      canPrepareMainRouteCut: canCutMainRoute,
      verifyPassed: fullVerifyPassed,
      fullVerifyPassed,
      coreVerifyPassed,
      compareVerifyAttempted,
      compareVerifyPassed,
      coreReady,
      compareObservedReady: compatReady,
      v2BaselineReady,
    },
    replacementGateStatus: gateViews,
    compareSummary: compare?.summary ?? emptyCompareSummary(),
    replaySummary: {
      summary: replay.summary,
      total: replay.total,
      passed: replay.passed,
      failed: replay.failed,
    },
    runtimeObservability: {
      databaseAvailable: runtimeObservability.databaseAvailable,
      samplingWindowDays: runtimeObservability.samplingWindowDays,
      windowStart: runtimeObservability.windowStart,
      windowEnd: runtimeObservability.windowEnd,
      performanceReady: runtimeObservability.performanceReady,
      globalLlmPhaseReady: runtimeObservability.globalLlmPhaseReady,
      llmTotals: runtimeObservability.llmStats,
      llmPhases: runtimeObservability.llmPhases,
      tokenPhases: runtimeObservability.tokenPhases,
      phaseViews: runtimeObservability.phaseViews,
      toolTotals: runtimeObservability.toolStats,
      toolBreakdown: runtimeObservability.toolBreakdown,
      v2RouteRuntime: runtimeObservability.v2RouteRuntime,
    },
    compareHighlights: {
      improvedCases: compareHighlights.improvedCases,
      regressedCases: compareHighlights.regressedCases,
      parityFailCases: compareHighlights.parityFailCases,
      watchlistCases: compareHighlights.watchlistCases,
    },
    roadmap: {
      total: roadmapItems.length,
      checked: checkedCount,
      pendingTopLevel: pendingTopLevel.map((item) => item.text),
    },
    risksAndBlockers: {
      highestRisk,
      mainBlockers: blockers,
      missingExternalConditions: compatReady
        ? []
        : ['跨版本 oracle / strict compare 仍存在差异，建议继续盯防，但它不再阻断纯 `V2` baseline readiness。'],
      rootCauseForNotReplacing: canCutMainRoute
        ? []
        : [
            ...(coreReady ? [] : ['纯 `V2` core gate 未全绿']),
            ...(routeAndFallbackCovered ? [] : ['主入口 route metadata / fallback 尚未固化']),
            ...(matrixCovered ? [] : ['真实场景验收矩阵尚未全部固化']),
            ...(contractReady ? [] : ['高价值 contract 仍未全部纳入固定回放门禁']),
            ...(pendingTopLevel.length > 0 ? ['`V1` 经验迁移未完成'] : []),
            '最终切主入口尚未执行',
            ...(runtimeObservability.performanceReady ? [] : ['显式 `V2` 路由运行态样本仍不足或未形成稳定观测']),
          ],
    },
    nextShortestPath: pendingTopLevel.length === 0
      ? [
          '保持 `npm run workflow:verify` 作为纯 `V2` 主链默认守门，持续确认 typecheck / runtime / smoke / replay 无回归。',
          '通过 `npm run workflow:refresh` 统一查看 core / baseline / compare / replaceability 四层结论，避免把历史 baseline 对齐和纯 `V2` readiness 混为一谈。',
          '通过 `npm run runtime:compare` 定期观察历史 baseline 与当前 `V2` 回放结果的差异，持续盯防回放回归。',
        ]
      : [
          '先保持 `npm run workflow:verify` 全绿，把纯 `V2` typecheck / runtime / smoke / replay 固化为独立主 gate。',
          runtimeObservability.performanceReady
            ? '再补齐主入口 route metadata / fallback、验收矩阵与 contract 硬化，让纯 `V2` baseline 自身闭环。'
            : '补齐显式 `V2` 路由运行态样本，并同步完善主入口 route metadata / fallback、验收矩阵与 contract 硬化。',
          '把 `npm run runtime:compare` 继续作为历史 baseline 观察入口，而不是纯 `V2` readiness 的主开关。',
        ],
    artifactPaths: {
      comparePath: comparePath || '未生成',
      replayPath,
    },
  };

  const phaseHotspots = summarizePhaseHotspots(runtimeObservability.phaseViews);
  const verifyArtifactsSummary = fullVerifyPassed
    ? '以及本次 full verify（当前等价 core gate）结果'
    : `本次 gate 标记：core=${passState(coreVerifyPassed)}，baseline=${passState(v2BaselineReady)}，compare=${compatVerifyState(compareVerifyPassed, compareVerifyAttempted)}，full=${passState(fullVerifyPassed)}`;
  const currentConclusion = report.overall.acceptanceStatus === '验收通过'
    ? `- **当前结论**: \`V2\` core 可运行 = ${yesNo(coreReady)}；纯 \`V2\` baseline 可替换 = ${yesNo(v2BaselineReady)}；历史 compare 观察 = ${yesNo(compatReady)}（仅辅助观察）`
    : `- **当前结论**: 可继续扩大灰度 = ${yesNo(report.overall.canExpandGray)}；可准备切主入口 = ${yesNo(report.overall.canPrepareMainRouteCut)}；历史 compare 观察 = ${yesNo(compatReady)}（仅辅助观察）`;
  const verifyStatusLine = `- **当前 verify 状态**: core=${passState(coreVerifyPassed)}；baseline=${passState(v2BaselineReady)}；compare=${compatVerifyState(compareVerifyPassed, compareVerifyAttempted)}；full=${passState(fullVerifyPassed)}`;

  const markdown = [
    '# V2 READINESS STATUS',
    '',
    `> 自动生成时间：${report.timestamp}`,
    `> 基于最新验证产物：${comparePath ? `\`${path.relative(root, comparePath)}\`` : '未生成 compare 报告'}、\`${path.relative(root, replayPath)}\`，${verifyArtifactsSummary}`,
    '',
    '## 总体状态',
    '',
    `- **当前阶段**: ${report.overall.currentStage}`,
    `- **当前验收状态**: ${report.overall.acceptanceStatus}`,
    `- **当前 gate 结论**: core=${passState(coreReady)}；baseline=${passState(v2BaselineReady)}；compare=${passState(compatReady)}；full=${passState(fullVerifyPassed)}`,
    currentConclusion,
    verifyStatusLine,
    '',
    '## 替换门槛状态',
    '',
    markdownTable(report.replacementGateStatus),
    '',
    '## 运行态拆账',
    '',
    `- **数据库状态**: ${runtimeObservability.databaseAvailable ? '可用' : '不可用'}`,
    `- **采样窗口**: 近 ${runtimeObservability.samplingWindowDays} 天（${runtimeObservability.windowStart} ~ ${runtimeObservability.windowEnd}）`,
    `- **显式 V2 样本**: total=${runtimeObservability.v2RouteRuntime.totalAttempts}，handled=${runtimeObservability.v2RouteRuntime.handledV2Count}，fallback=${runtimeObservability.v2RouteRuntime.fallbackCount}，eligible=${runtimeObservability.v2RouteRuntime.eligibleCount}`,
    `- **V2 主链 phase**: intentInference samples=${runtimeObservability.v2RouteRuntime.intentPhaseSamples} / intentLLM=${runtimeObservability.v2RouteRuntime.intentLlmEnabledSamples} / v2Runtime=${runtimeObservability.v2RouteRuntime.v2RuntimeSamples} / toolExecution=${runtimeObservability.v2RouteRuntime.toolExecutionSamples}`,
    `- **V2 主链耗时**: intentInference 平均 ${runtimeObservability.v2RouteRuntime.avgIntentInferMs}ms，V2 runtime 平均 ${runtimeObservability.v2RouteRuntime.avgV2RouteMs}ms`,
    `- **V2 模式分布**: ${runtimeObservability.v2RouteRuntime.modes.length > 0 ? runtimeObservability.v2RouteRuntime.modes.map((item) => `${item.mode}:${item.count}`).join('，') : '暂无显式 V2 handled 样本'}`,
    `- **全局 LLM 总览（参考）**: total=${runtimeObservability.llmStats.totalCalls}，success=${runtimeObservability.llmStats.successCalls}，error=${runtimeObservability.llmStats.errorCalls}，avgLatency=${runtimeObservability.llmStats.avgLatencyMs}ms，tokens=${runtimeObservability.llmStats.totalTokens}`,
    `- **全局 Tool 总览（参考）**: total=${runtimeObservability.toolStats.totalCalls}，success=${runtimeObservability.toolStats.successCalls}，error=${runtimeObservability.toolStats.errorCalls}，avgLatency=${runtimeObservability.toolStats.avgLatencyMs}ms`,
    `- **全局 LLM 最慢阶段（参考）**: ${phaseHotspots.slowest}`,
    `- **全局 LLM 最大 Prompt 阶段（参考）**: ${phaseHotspots.heaviestPrompt}`,
    '',
    '### 全局 LLM Phase 参考',
    '',
    markdownRuntimePhaseTable(runtimeObservability.phaseViews),
    '',
    ...(runtimeObservability.toolBreakdown.length > 0
      ? ['### 工具执行热点', '', markdownToolBreakdownTable(runtimeObservability.toolBreakdown), '']
      : ['### 工具执行热点', '', '- 当前无可用工具执行样本，或数据库不可用。', '']),
    '## 真实差 case / Watchlist',
    '',
    `- **Improved**: ${compareHighlights.improvedCases.length > 0 ? compareHighlights.improvedCases.map((item) => item.id).join(', ') : '无'}`,
    `- **Regressed**: ${compareHighlights.regressedCases.length > 0 ? compareHighlights.regressedCases.map((item) => item.id).join(', ') : '无'}`,
    `- **Parity Fail**: ${compareHighlights.parityFailCases.length > 0 ? compareHighlights.parityFailCases.map((item) => item.id).join(', ') : '无'}`,
    `- **Watchlist**: ${compareHighlights.watchlistCases.length > 0 ? compareHighlights.watchlistCases.map((item) => item.id).join(', ') : '无'}`,
    '',
    ...(compareHighlights.improvedCases.length > 0
      ? ['### Improved Cases', '', ...compareHighlights.improvedCases.map(formatCaseLine), '']
      : []),
    ...(compareHighlights.regressedCases.length > 0
      ? ['### Regressed Cases', '', ...compareHighlights.regressedCases.map(formatCaseLine), '']
      : []),
    ...(compareHighlights.watchlistCases.length > 0
      ? ['### Watchlist Cases', '', ...compareHighlights.watchlistCases.map(formatCaseLine), '']
      : []),
    '## 风险与阻塞',
    '',
    `- **当前最高风险**: ${report.risksAndBlockers.highestRisk}`,
    `- **当前主要阻塞**: ${report.risksAndBlockers.mainBlockers.length > 0 ? report.risksAndBlockers.mainBlockers.join('；') : '无'}`,
    `- **缺失的外部条件**: ${report.risksAndBlockers.missingExternalConditions.length > 0 ? report.risksAndBlockers.missingExternalConditions.join('；') : '无'}`,
    `- **还不能替换的根因**: ${report.risksAndBlockers.rootCauseForNotReplacing.length > 0 ? report.risksAndBlockers.rootCauseForNotReplacing.join('；') : '当前已满足替换条件。'}`,
    '',
    '## 下一步最短路径',
    '',
    ...report.nextShortestPath.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## 关键验证摘要',
    '',
    ...(compare
      ? [`- **strict compare**: total=${compare.summary.total}，shared=${compare.summary.sharedCases}，improved=${compare.summary.improved}，regressed=${compare.summary.regressed}，parity-pass=${compare.summary.parityPass}，parity-fail=${compare.summary.parityFail}`]
      : ['- **strict compare**: 暂无最新 compare 产物（当前可按需执行 `npm run runtime:compare` 补齐）']),
    `- **replay**: ${replay.summary} (${replay.passed}/${replay.total})`,
    `- **P11 路线图进度**: ${checkedCount}/${roadmapItems.length} 已完成；未完成顶层项 ${pendingTopLevel.length} 个`,
    '',
    '## 未完成顶层项',
    '',
    ...(pendingTopLevel.length > 0
      ? pendingTopLevel.map((item) => `- ${item.text}`)
      : ['- 无，当前顶层迁移项已全部完成。']),
    '',
  ].join('\n');

  const reportsDir = path.join(root, 'v2/eval/reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonOutputPath = path.join(reportsDir, `READINESS-${timestampLabel()}.json`);
  fs.writeFileSync(jsonOutputPath, JSON.stringify(report, null, 2));

  const mdOutputPath = path.join(root, 'docs/verification/V2-READINESS-STATUS.MD');
  fs.writeFileSync(mdOutputPath, markdown);

  console.log(`V2 readiness status: ${report.overall.acceptanceStatus}`);
  console.log(`Core gate passed: ${yesNo(coreVerifyPassed)}`);
  console.log(`Pure V2 baseline ready: ${yesNo(v2BaselineReady)}`);
  console.log(`Compare verify passed: ${yesNo(compareVerifyPassed)}`);
  console.log(`Historical compare observed ready: ${yesNo(compatReady)}`);
  console.log(`Full verify passed: ${yesNo(fullVerifyPassed)}`);
  console.log(`Can expand gray: ${yesNo(canExpandGray)}`);
  console.log(`Can cut main route: ${yesNo(canCutMainRoute)}`);
  console.log(`Runtime observability ready: ${yesNo(runtimeObservability.performanceReady)}`);
  console.log(`Readiness report saved: ${jsonOutputPath}`);
  console.log(`Status markdown updated: ${mdOutputPath}`);
}

function migrationInProgress(pendingTopLevel: RoadmapItem[]): boolean {
  return pendingTopLevel.some(isMigrationTask);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
