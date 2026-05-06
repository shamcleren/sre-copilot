import type { RuntimeAdapter, RuntimeAdapterExecuteOptions } from '../adapters';
import type {
  Blocker,
  BlockerCode,
  EvidenceItem,
  InvestigationMode,
  PlanStep,
  RuntimeResult,
  RuntimeToolCall,
  RuntimeToolExecution,
  ToolClass,
  TurnInput,
  TurnModel,
} from '../contracts';
import { chooseInitialToolClasses } from '../policies/telemetry-first.policy';
import { troubleshootingPlaybook } from '../playbooks/troubleshooting.playbook';
import { buildConclusion } from './build-conclusion';
import { modelTurn } from './model-turn';

export interface RuntimeExecutionOptions extends RuntimeAdapterExecuteOptions {
  adapter?: RuntimeAdapter;
}

interface NormalizedRuntimeToolCall extends RuntimeToolCall {
  toolClass: ToolClass;
  params: Record<string, unknown>;
}

interface PreparedRuntimeCase {
  input: TurnInput;
  mode: InvestigationMode;
  turnModel: TurnModel;
  selectedToolClasses: ToolClass[];
  plannedToolRequests: NormalizedRuntimeToolCall[];
  plan: PlanStep[];
  baseEvidence: EvidenceItem[];
  blocker?: Blocker;
}

const TOOL_NAME_TO_CLASS: Record<string, ToolClass> = {
  query_metrics: 'unify_query',
  query_promql: 'unify_query',
  query_trace: 'unify_query',
  query_log: 'unify_query',
  list_field_keys: 'unify_query',
  list_tag_keys: 'unify_query',
  list_tag_values: 'unify_query',
  get_field_map: 'unify_query',
  query_relation_multi_resource: 'relation',
  query_relation_multi_resource_range: 'relation',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function canResolveTarget(turnModel: TurnModel): boolean {
  return troubleshootingPlaybook.locatorSources.includes(turnModel.targetResolutionSource);
}

function buildServiceResolutionSummary(turnModel: TurnModel): string {
  switch (turnModel.targetResolutionSource) {
    case 'trace':
      return '当前轮已具备 Trace 线索，可直接回溯请求链路。';
    case 'pod':
      return '当前轮已具备 Pod 线索，可继续串联 service / deployment 与 telemetry。';
    case 'service':
      return '当前轮已具备显式服务线索，可直接进入 telemetry-first 排查。';
    case 'domain':
      return '当前轮已具备域名线索，可先验证现象，再补做归属 service 解析。';
    case 'promql':
      return '当前轮已具备可直接验证的查询线索。';
    case 'business_context':
      return `当前轮已锁定业务上下文 ${turnModel.businessHint}，可先做 relation 解析归属 service。`;
    default:
      return '当前轮已具备可进入排查链路的对象线索。';
  }
}

function buildRuntimeSignalSummary(turnModel: TurnModel): string {
  switch (turnModel.validationFocus) {
    case 'query_correctness':
      return '首跳应先验证时间范围 / 查询条件 / 数据源 / 指标是否对齐，再判断现象是否真实。';
    case 'symptom_truth':
      return '首跳应先证伪现象真实性，再区分采集异常与业务真实波动。';
    case 'entity_resolution':
      return turnModel.targetResolutionSource === 'business_context'
        ? '首跳应先做 relation 解析业务归属的 service / deployment，再回到 telemetry-first。'
        : '首跳应优先串联实体关系，再决定下一步 telemetry 取证。';
    case 'runtime_failure':
      return '首跳应先验证实时信号，再核对启动错误与配置线索。';
    default:
      return '按 telemetry-first 规则，首跳应优先验证实时指标 / 日志 / Trace。';
  }
}

function deriveEvidence(turnModel: TurnModel, toolClasses: ToolClass[], mode: InvestigationMode): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];

  if (turnModel.hasPromQL) {
    evidence.push({
      type: 'query_artifact',
      summary: '用户已直接提供可验证的查询表达式。',
      source: 'input',
      confirmed: true,
    });
  }

  if (canResolveTarget(turnModel)) {
    evidence.push({
      type: 'service_resolution',
      summary: buildServiceResolutionSummary(turnModel),
      source: 'derived',
      confirmed: true,
    });
  }

  if (mode === 'continue_investigation' && toolClasses.length > 0) {
    evidence.push({
      type: 'runtime_signal',
      summary: buildRuntimeSignalSummary(turnModel),
      source: 'runtime',
      confirmed: true,
    });
  }

  return evidence;
}

function chooseMode(turnModel: TurnModel): InvestigationMode {
  if (canResolveTarget(turnModel)) {
    return 'continue_investigation';
  }
  if (turnModel.collaborationHint) {
    return 'collaborative_request';
  }
  return 'request_evidence';
}

function buildMissingEvidence(turnModel: TurnModel, mode: InvestigationMode): string[] {
  if (mode === 'collaborative_request') {
    if (/超时/.test(turnModel.rawMessage)) {
      return ['服务名', '一次超时样本', '错误日志'];
    }
    if (turnModel.validationFocus === 'runtime_failure') {
      return ['实例名', '启动报错', '最近配置变更'];
    }
    if (/没上报|采集器/.test(turnModel.rawMessage)) {
      return ['采集器实例', '目标服务名', '错误日志'];
    }
    if (turnModel.validationFocus === 'query_correctness') {
      return ['时间范围', '查询条件', '数据源', '指标名'];
    }
    if (turnModel.validationFocus === 'symptom_truth') {
      return ['服务名', '时间范围', '在线人数样本'];
    }
    return ['服务名', '现象样本', '错误日志'];
  }

  if (turnModel.serviceStatusIntent) {
    return ['服务名', '业务名', 'Pod 名', '域名', 'PromQL'];
  }

  if (turnModel.noDataSymptom) {
    return ['时间范围', '查询条件', '数据源', '指标名'];
  }

  return ['服务名', 'Pod 名', '域名', 'PromQL'];
}

function buildGapSummary(turnModel: TurnModel, mode: InvestigationMode): string {
  if (mode === 'collaborative_request') {
    return '当前已识别到异常现象，但缺少稳定定位对象或关键样本，暂时无法收敛根因。';
  }
  if (turnModel.serviceStatusIntent) {
    return '当前想看服务状态，但还缺少服务名或业务上下文，无法解析归属对象。';
  }
  return '当前轮缺少稳定定位对象，无法安全进入排查链路。';
}

function buildContextBlocker(turnModel: TurnModel, mode: InvestigationMode): Blocker | undefined {
  if (mode === 'continue_investigation') {
    return undefined;
  }

  return {
    code: mode === 'collaborative_request' ? 'insufficient_context' : 'missing_target',
    summary: mode === 'collaborative_request'
      ? '已有异常现象，但还缺少稳定定位对象与关键样本'
      : turnModel.serviceStatusIntent
        ? '缺少服务名 / 业务上下文 / Pod / 域名 / PromQL 等可用于解析服务归属的对象'
        : '缺少服务名 / Pod / 域名 / PromQL 等定位对象',
    missing: buildMissingEvidence(turnModel, mode),
  };
}

function resolveToolClass(toolCall: RuntimeToolCall): ToolClass | undefined {
  return toolCall.toolClass ?? TOOL_NAME_TO_CLASS[toolCall.toolName];
}

function normalizeToolRequests(input: TurnInput, selectedToolClasses: ToolClass[]): NormalizedRuntimeToolCall[] {
  if (!Array.isArray(input.toolRequests) || input.toolRequests.length === 0) {
    return [];
  }

  return input.toolRequests
    .map((toolCall) => {
      const toolClass = resolveToolClass(toolCall);
      if (!toolClass || !selectedToolClasses.includes(toolClass)) {
        return undefined;
      }
      return {
        ...toolCall,
        toolClass,
        params: isRecord(toolCall.params) ? toolCall.params : {},
      } satisfies NormalizedRuntimeToolCall;
    })
    .filter((toolCall): toolCall is NormalizedRuntimeToolCall => Boolean(toolCall));
}

function buildToolPlanSummary(
  toolClass: ToolClass,
  toolRequests: NormalizedRuntimeToolCall[],
  turnModel: TurnModel,
): string {
  const names = toolRequests
    .filter((toolCall) => toolCall.toolClass === toolClass)
    .map((toolCall) => toolCall.toolName);
  const suffix = names.length > 0 ? `：${names.join(' / ')}` : '';

  if (toolClass === 'relation' && turnModel.targetResolutionSource === 'business_context') {
    return `先解析业务上下文归属的 service / deployment${suffix}`;
  }
  if (toolClass === 'unify_query' && turnModel.validationFocus === 'query_correctness') {
    return `先验证时间范围 / 查询条件 / 数据源 / 指标${suffix}`;
  }
  if (toolClass === 'unify_query' && turnModel.validationFocus === 'symptom_truth') {
    return `先证伪现象真实性并确认是否业务真实波动${suffix}`;
  }
  if (toolClass === 'unify_query' && turnModel.hasTraceId) {
    return `先查 trace 详情，再补串联 service / pod${suffix}`;
  }
  if (toolClass === 'relation' && turnModel.relationIntent && turnModel.explicitPod) {
    return `先串联 pod / service / deployment 关系链${suffix}`;
  }
  if (toolClass === 'knowledge' && turnModel.startupOrConfigFailure) {
    return `补充启动失败与配置知识线索${suffix}`;
  }
  if (names.length === 0) {
    return `规划首批 ${toolClass} 类工具`;
  }
  return `规划首批 ${toolClass} 类工具：${names.join(' / ')}`;
}

function buildPlan(
  mode: InvestigationMode,
  toolClasses: ToolClass[],
  toolRequests: NormalizedRuntimeToolCall[],
  turnModel: TurnModel,
): PlanStep[] {
  const plan: PlanStep[] = [
    { kind: 'select_playbook', summary: '选中 troubleshooting-core playbook' },
  ];

  if (mode === 'request_evidence') {
    plan.push({ kind: 'request_evidence', summary: '先请求最小补充材料' });
  } else if (mode === 'collaborative_request') {
    plan.push({ kind: 'request_evidence', summary: '先说明卡点并请求最小补充材料' });
  } else {
    for (const toolClass of toolClasses) {
      plan.push({
        kind: 'invoke_tool',
        summary: buildToolPlanSummary(toolClass, toolRequests, turnModel),
        toolClass,
      });
    }
  }

  plan.push({ kind: 'build_conclusion', summary: '构建结构化结论' });
  return plan;
}

function hasUsableData(data: unknown): boolean {
  if (data === null || data === undefined) {
    return false;
  }
  if (typeof data === 'string') {
    return data.trim().length > 0;
  }
  if (Array.isArray(data)) {
    return data.length > 0;
  }
  if (typeof data === 'object') {
    return Object.keys(data).length > 0;
  }
  return true;
}

function summarizeToolExecution(toolExecution: RuntimeToolExecution): string {
  if (toolExecution.success && hasUsableData(toolExecution.data)) {
    return `${toolExecution.toolName} 已返回可用结果。`;
  }
  if (toolExecution.success) {
    return `${toolExecution.toolName} 已执行，但未返回可用数据。`;
  }
  return `${toolExecution.toolName} 执行失败：${toolExecution.error || '未知错误'}。`;
}

function deriveToolExecutionEvidence(toolExecutions: RuntimeToolExecution[]): EvidenceItem[] {
  return toolExecutions.map((toolExecution) => ({
    type: toolExecution.success && hasUsableData(toolExecution.data) ? 'tool_result' : 'tool_failure',
    summary: summarizeToolExecution(toolExecution),
    source: 'adapter',
    confirmed: true,
  }));
}

function buildRuntimeBlocker(code: BlockerCode, toolName: string, error?: string): Blocker {
  switch (code) {
    case 'empty_result':
      return {
        code,
        toolName,
        summary: `${toolName} 已执行成功，但当前时间范围或查询条件下没有返回可用结果。`,
        retryable: true,
      };
    case 'tool_timeout':
      return {
        code,
        toolName,
        summary: `${toolName} 调用超时，当前还没拿到首跳 telemetry 结果。`,
        retryable: true,
      };
    case 'authentication_failed':
      return {
        code,
        toolName,
        summary: `${toolName} 鉴权失败，当前凭证不足以继续获取实时数据。`,
        retryable: false,
      };
    case 'permission_denied':
      return {
        code,
        toolName,
        summary: `${toolName} 权限不足，当前无法继续拉取实时数据。`,
        retryable: false,
      };
    case 'adapter_unavailable':
      return {
        code,
        toolName,
        summary: `${toolName} 仍由占位 adapter 承接，V2 还未接入真实执行器。`,
        retryable: false,
      };
    default:
      return {
        code: 'tool_error',
        toolName,
        summary: `${toolName} 执行失败：${error || '未知错误'}`,
        retryable: true,
      };
  }
}

function deriveRuntimeBlocker(toolExecutions: RuntimeToolExecution[]): Blocker | undefined {
  if (toolExecutions.length === 0) {
    return undefined;
  }

  if (toolExecutions.some((toolExecution) => toolExecution.success && hasUsableData(toolExecution.data))) {
    return undefined;
  }

  const emptyExecution = toolExecutions.find((toolExecution) => toolExecution.success && !hasUsableData(toolExecution.data));
  if (emptyExecution) {
    return buildRuntimeBlocker('empty_result', emptyExecution.toolName);
  }

  const failedExecution = toolExecutions.find((toolExecution) => !toolExecution.success || toolExecution.blockerCode);
  if (failedExecution) {
    return buildRuntimeBlocker(
      failedExecution.blockerCode ?? 'tool_error',
      failedExecution.toolName,
      failedExecution.error,
    );
  }

  return undefined;
}

function prepareCase(input: TurnInput): PreparedRuntimeCase {
  const turnModel = modelTurn(input);
  const mode = chooseMode(turnModel);
  const selectedToolClasses = mode === 'continue_investigation'
    ? chooseInitialToolClasses(turnModel)
    : [];
  const plannedToolRequests = normalizeToolRequests(input, selectedToolClasses);
  const baseEvidence = deriveEvidence(turnModel, selectedToolClasses, mode);
  if (mode !== 'continue_investigation') {
    baseEvidence.push({
      type: 'gap',
      summary: buildGapSummary(turnModel, mode),
      source: 'runtime',
      confirmed: true,
    });
  }

  return {
    input,
    mode,
    turnModel,
    selectedToolClasses,
    plannedToolRequests,
    plan: buildPlan(mode, selectedToolClasses, plannedToolRequests, turnModel),
    baseEvidence,
    blocker: buildContextBlocker(turnModel, mode),
  };
}

function finalizeRuntimeResult(
  prepared: PreparedRuntimeCase,
  toolExecutions: RuntimeToolExecution[] = [],
  adapterName?: string,
): RuntimeResult {
  const blocker = prepared.mode === 'continue_investigation'
    ? deriveRuntimeBlocker(toolExecutions)
    : prepared.blocker;
  const evidence = [...prepared.baseEvidence, ...deriveToolExecutionEvidence(toolExecutions)];
  const conclusion = buildConclusion({
    mode: prepared.mode,
    turnModel: prepared.turnModel,
    evidence,
    blocker,
    firstToolClass: prepared.selectedToolClasses[0],
  });

  return {
    playbookId: troubleshootingPlaybook.id,
    mode: prepared.mode,
    turnModel: prepared.turnModel,
    selectedToolClasses: prepared.selectedToolClasses,
    plan: prepared.plan,
    evidence,
    blocker,
    conclusion,
    toolExecutions,
    adapterName,
  };
}

async function executeCaseWithAdapter(
  prepared: PreparedRuntimeCase,
  options: RuntimeExecutionOptions,
): Promise<RuntimeResult> {
  const { adapter } = options;
  if (!adapter) {
    return finalizeRuntimeResult(prepared);
  }

  if (prepared.mode !== 'continue_investigation' || prepared.plannedToolRequests.length === 0) {
    return finalizeRuntimeResult(prepared, [], adapter.name);
  }

  const toolExecutions = await Promise.all(
    prepared.plannedToolRequests.map((toolCall) => adapter.execute(toolCall, { adapterContext: options.adapterContext ?? prepared.input.context })),
  );

  return finalizeRuntimeResult(prepared, toolExecutions, adapter.name);
}

export function executeCase(input: TurnInput): RuntimeResult;
export function executeCase(input: TurnInput, options: RuntimeExecutionOptions & { adapter: RuntimeAdapter }): Promise<RuntimeResult>;
export function executeCase(
  input: TurnInput,
  options?: RuntimeExecutionOptions,
): RuntimeResult | Promise<RuntimeResult> {
  const prepared = prepareCase(input);
  if (!options?.adapter) {
    return finalizeRuntimeResult(prepared);
  }
  return executeCaseWithAdapter(prepared, options);
}
