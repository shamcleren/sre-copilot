import type {
  Blocker,
  Conclusion,
  EvidenceItem,
  InvestigationMode,
  ToolClass,
  TurnModel,
} from '../contracts';

function joinFacts(evidence: EvidenceItem[]): string[] {
  return evidence.filter((item) => item.confirmed).map((item) => item.summary);
}

function buildReply(lines: string[]): string {
  return lines.join('\n');
}

function describeNextAction(toolClass: ToolClass | undefined, turnModel: TurnModel): string {
  if (turnModel.validationFocus === 'query_correctness') {
    return '优先核对时间范围、查询条件、数据源和指标定义，再判断是否真实无数据。';
  }

  if (turnModel.validationFocus === 'symptom_truth') {
    return '优先查在线人数指标序列、时间范围和相邻指标，确认是采集异常还是业务真实波动。';
  }

  if (turnModel.targetResolutionSource === 'business_context' && turnModel.validationFocus === 'entity_resolution') {
    return '先用 relation 解析业务归属的 service / deployment，再回到 telemetry-first。';
  }

  if (turnModel.hasTraceId) {
    return '优先查 trace 详情，再串联 service / pod / 日志。';
  }

  if (turnModel.relationIntent && turnModel.explicitPod) {
    return '先串联 pod / service / deployment 关系链，再决定是否补查 telemetry。';
  }

  if (turnModel.startupOrConfigFailure) {
    return '优先查实时指标 / 日志；如果 InitTempDir 启动失败稳定复现，再补充知识库或配置校验。';
  }

  switch (toolClass) {
    case 'unify_query':
      return '优先走 telemetry-first，先查实时指标 / 日志 / Trace。';
    case 'relation':
      return '补做实体关联，确认 pod / service / deployment 关系链。';
    case 'k8s':
      return '仅在 telemetry 不足时再下钻到 K8s。';
    case 'ssh':
      return '仅在 telemetry 与关系证据不足时再走 SSH。';
    default:
      return '先补证据，再决定下一跳。';
  }
}

function buildContinueSummary(turnModel: TurnModel): string {
  if (turnModel.validationFocus === 'query_correctness') {
    return '更像查询链路或观测配置问题，先证伪“没数据”这个判断，再验证时间范围 / 查询 / 数据源 / 指标是否对齐。';
  }

  if (turnModel.validationFocus === 'symptom_truth') {
    return '已具备 telemetry 排查种子，但先要证伪“在线人数掉零”是否真实，再判断是采集异常还是业务真实波动。';
  }

  if (turnModel.targetResolutionSource === 'business_context' && turnModel.validationFocus === 'entity_resolution') {
    return '已锁定业务上下文，但还需要先解析归属 service，再进入 telemetry-first。';
  }

  if (turnModel.hasTraceId) {
    return 'trace 已给出，先从 trace 详情回溯关联 service / pod。';
  }

  if (turnModel.relationIntent && turnModel.explicitPod) {
    return 'Pod 已给出，先做实体关联定位关联的 Service / Deployment。';
  }

  if (turnModel.startupOrConfigFailure) {
    return '已具备服务级排查种子，先验证实时信号，再核对启动错误与配置。';
  }

  return '已具备进入排查链路的最小对象信息。';
}

function buildContinueFacts(turnModel: TurnModel, confirmedFacts: string[]): string {
  const detailFacts: string[] = [];

  if (turnModel.businessHint) {
    detailFacts.push(`已锁定业务上下文：${turnModel.businessHint}`);
  }
  if (turnModel.targetResolutionSource === 'business_context') {
    detailFacts.push('当前尚未拿到显式服务对象，需要先通过 relation 解析服务归属');
  }
  if (turnModel.serviceStatusIntent && turnModel.targetResolutionSource === 'business_context') {
    detailFacts.push('当前诉求是看服务状态，因此不能只停在业务名，需要继续解析到 service / deployment');
  }
  if (turnModel.validationFocus === 'symptom_truth') {
    detailFacts.push('当前现象是在线人数指标序列突然掉零，但这仍是待验证现象，不能直接当成业务真实下降');
  }
  if (turnModel.validationFocus === 'query_correctness') {
    detailFacts.push('当前现象是查询结果或仪表盘没有数据，但这仍是待验证现象，不能直接当成最终结论');
  }
  if (turnModel.hasTraceId) {
    detailFacts.push('已提供 trace_id，可直接反查请求链路');
  }
  if (turnModel.relationIntent && turnModel.explicitPod) {
    detailFacts.push('用户明确要求串联 Pod、Service 与 Deployment 关系');
  }
  if (turnModel.startupOrConfigFailure) {
    detailFacts.push('当前现象包含 Windows 主机上的 InitTempDir 启动失败，可继续核对 TEMP / TMP 临时目录与启动用户权限');
  }

  const merged = [...detailFacts, ...confirmedFacts];
  return merged.join('；') || '已识别到可定位对象。';
}

function buildCollaborativeSummary(turnModel: TurnModel): string {
  if (/超时/.test(turnModel.rawMessage)) {
    return '当前证据还不足，先不要直接定性为网络或服务侧问题；排查卡点在于缺少稳定对象与超时样本。';
  }
  if (turnModel.validationFocus === 'runtime_failure') {
    return '当前证据还不足，暂时无法确认是启动失败还是配置异常；排查卡点在于缺少实例信息、启动报错和最近变更。';
  }
  if (/没上报|采集器/.test(turnModel.rawMessage)) {
    return '当前证据还不足，暂时无法确认不上报卡点，缺少采集器实例和目标服务信息。';
  }
  if (turnModel.validationFocus === 'query_correctness') {
    return '当前证据还不足，先不要直接定性为配置或采集问题；排查卡点在于缺少时间范围、查询条件和数据源信息。';
  }
  if (turnModel.validationFocus === 'symptom_truth') {
    return '当前证据还不足，先不要直接把“在线人数掉零”定性为业务真实下降；排查卡点在于缺少稳定对象、时间范围和在线人数样本。';
  }
  return '当前证据还不足，先不要直接定性根因，需要协作补齐最小材料。';
}

function buildCollaborativeNext(blocker: Blocker | undefined, turnModel: TurnModel): string {
  const missingEvidence = blocker?.missing ?? ['服务名', '现象样本', '错误日志'];

  if (/超时/.test(turnModel.rawMessage)) {
    return `请先补充/提供 ${missingEvidence.join(' / ')}，尤其确认服务名，并带一条超时样本或错误日志，我再继续排查。`;
  }
  if (turnModel.validationFocus === 'runtime_failure') {
    return `请先补充/提供 ${missingEvidence.join(' / ')}，并说明最近是否做过发布或配置变更，我再继续判断是启动失败还是配置异常。`;
  }
  if (/没上报|采集器/.test(turnModel.rawMessage)) {
    return `请先补充/提供 ${missingEvidence.join(' / ')}，并确认最近是否有配置变更，我再继续定位不上报原因。`;
  }
  if (turnModel.validationFocus === 'query_correctness') {
    return `请先补充/提供 ${missingEvidence.join(' / ')}；如果方便，也带上仪表盘链接或 PromQL 片段，我再继续确认是不是查询链路问题。`;
  }
  if (turnModel.validationFocus === 'symptom_truth') {
    return `请先补充/提供 ${missingEvidence.join(' / ')}；如果方便，也带上相邻指标或仪表盘截图/链接，我再继续确认是采集异常还是业务真实波动。`;
  }
  return `请先补充/提供 ${missingEvidence.join(' / ')}，我再继续确认当前卡点。`;
}

function buildBlockedContinueSummary(blocker: Blocker, turnModel: TurnModel): string {
  switch (blocker.code) {
    case 'empty_result':
      return turnModel.noDataSymptom
        ? '首跳查询没有拿到有效结果，先确认时间范围、查询条件和数据源是否对齐。'
        : '首跳工具已执行，但没有拿到可继续收敛的实时结果。';
    case 'tool_timeout':
      return '首跳 telemetry 查询超时，当前还不能据此下结论。';
    case 'authentication_failed':
      return '首跳 telemetry 查询因鉴权失败被拦住，暂时无法继续拉取实时数据。';
    case 'permission_denied':
      return '首跳 telemetry 查询因权限不足被拦住，暂时无法继续下钻。';
    case 'adapter_unavailable':
      return 'V2 已识别出正确排查链路，但当前 adapter 仍是占位实现。';
    default:
      return '已识别排查对象，但首跳工具执行失败，当前还不能继续收敛。';
  }
}

function buildBlockedContinueNext(blocker: Blocker, firstToolClass?: ToolClass): string {
  switch (blocker.code) {
    case 'empty_result':
      return '先缩小时间范围并补充查询条件；如果仍为空，再核对指标、日志源或实体关联是否正确。';
    case 'tool_timeout':
      return '优先重试首跳查询，必要时缩小时间窗口或减少查询维度，再继续 telemetry-first。';
    case 'authentication_failed':
      return '先补齐可用凭证或修正鉴权配置，再重新执行首跳 telemetry 查询。';
    case 'permission_denied':
      return '先申请或切换到具备权限的上下文，再重新执行首跳查询。';
    case 'adapter_unavailable':
      return '先接通真实 adapter，再让 V2 消费实时工具结果。';
    default:
      return firstToolClass === 'relation'
        ? '先确认实体关联查询参数，再补跑首跳关系/telemetry 查询。'
        : '先确认首跳工具参数与上下文，再补跑 telemetry-first 查询。';
  }
}

export function buildConclusion(params: {
  mode: InvestigationMode;
  turnModel: TurnModel;
  evidence: EvidenceItem[];
  blocker?: Blocker;
  firstToolClass?: ToolClass;
}): Conclusion {
  const { mode, turnModel, evidence, blocker, firstToolClass } = params;
  const confirmedFacts = joinFacts(evidence);

  if (mode === 'request_evidence') {
    const missingEvidence = blocker?.missing ?? ['服务名 / Pod / 域名 / PromQL'];
    return {
      mode,
      summary: '当前还无法稳定定位排查对象，需要先补最小材料。',
      confirmedFacts,
      hypotheses: ['用户意图是排障，但当前对象未定位。'],
      nextActions: ['补齐任一可定位对象后，优先进入 telemetry-first；如果只有业务上下文，我会先解析归属 service。'],
      missingEvidence,
      reply: buildReply([
        '当前判断：还无法稳定定位排查对象，先补最小材料。',
        `缺失材料：${missingEvidence.join(' / ')}`,
        '下一步：你补齐任一项后，我会先走 telemetry-first；如果只给业务上下文，我会先解析归属 service，而不是直接跳 K8s/SSH。',
      ]),
    };
  }

  if (mode === 'collaborative_request') {
    const missingEvidence = blocker?.missing ?? ['服务名', '现象样本', '错误日志'];
    return {
      mode,
      summary: buildCollaborativeSummary(turnModel),
      confirmedFacts,
      hypotheses: ['当前已有异常现象，但关键信息仍未确认。'],
      nextActions: [buildCollaborativeNext(blocker, turnModel)],
      missingEvidence,
      reply: buildReply([
        `当前判断：${buildCollaborativeSummary(turnModel)}`,
        `已确认事实：${confirmedFacts.join('；') || '已经确认存在异常现象，但关键对象仍未确认。'}`,
        `下一步：${buildCollaborativeNext(blocker, turnModel)}`,
      ]),
    };
  }

  if (blocker) {
    const summary = buildBlockedContinueSummary(blocker, turnModel);
    const nextAction = buildBlockedContinueNext(blocker, firstToolClass);
    return {
      mode,
      summary,
      confirmedFacts,
      hypotheses: ['已定位到排查对象，但首跳工具尚未返回可继续收敛的结果。'],
      nextActions: [nextAction],
      missingEvidence: blocker.missing ?? [],
      reply: buildReply([
        `当前判断：${summary}`,
        `已确认事实：${buildContinueFacts(turnModel, confirmedFacts)}`,
        `阻塞点：${blocker.summary}`,
        `下一步：${nextAction}`,
      ]),
    };
  }

  const missingEvidence: string[] = [];
  const summary = buildContinueSummary(turnModel);
  const nextAction = describeNextAction(firstToolClass, turnModel);
  return {
    mode,
    summary,
    confirmedFacts,
    hypotheses: ['当前阶段只确认进入正确链路，尚未给出最终根因。'],
    nextActions: [nextAction],
    missingEvidence,
    reply: buildReply([
      `当前判断：${summary}`,
      `已确认事实：${buildContinueFacts(turnModel, confirmedFacts)}`,
      `下一步：${nextAction}`,
    ]),
  };
}
