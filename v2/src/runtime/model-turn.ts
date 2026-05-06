import type {
  EntityRef,
  TargetResolutionSource,
  TurnInput,
  TurnModel,
  ValidationFocus,
} from '../contracts';

const DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+){2,}\b/i;
const POD_RE = /\bpod\s+([a-z0-9][a-z0-9-]+)/i;
const TRACE_RE = /\btrace[_-]?id[:=\s]+([a-z0-9-]+)/i;
const PROMQL_RE = /(promql|sum\(|rate\(|avg\(|count\(|histogram_quantile\(|\{[^}]+\}\[[0-9]+[smhd]\])/i;
const ISSUE_RE = /(没有数据|没数据|空的|空值|掉零|异常|报错|启动失败|重启|超时|没上报|请求报错)/;
const NO_DATA_RE = /(没有数据|没数据|空的|空值|返回空值|仪表盘上没有数据)/;
const ONLINE_METRIC_RE = /(在线人数|掉零|序列)/;
const RELATION_RE = /(关联的?\s*(service|deployment|pod)|service\s+和\s+deployment|service\s+和\s+pod|trace.*关联.*(service|pod)|串联|归属|定位.*service|服务归属)/i;
const COLLABORATION_RE = /(自研|不确定|有个服务|偶尔|网络问题|采集器)/;
const SERVICE_STATUS_RE = /(服务情况|服务状态|运行情况|现在什么情况|看看服务情况)/i;
const STARTUP_OR_CONFIG_RE = /(windows|inittempdir|启动失败|collector|agent|配置异常|配置问题)/i;
const SERVICE_PATTERNS = [
  /看下\s+([a-z0-9-]{2,})\s+现在什么情况/i,
  /服务\s+([a-z0-9-]{2,})/i,
  /([a-z0-9-]{2,})\s+为什么(?:异常|报错|启动失败|超时)/i,
  /^([a-z][a-z0-9-]{2,})\s+在/i,
  /^([a-z][a-z0-9-]{2,})\s+(?:一直在|启动失败|报错|异常)/i,
];

function pushEntity(entities: EntityRef[], entity: EntityRef): void {
  if (entities.some((item) => item.type === entity.type && item.value === entity.value)) {
    return;
  }
  entities.push(entity);
}

function readContextString(context: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = context?.[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function detectService(rawMessage: string, explicitPod: boolean): string | undefined {
  if (explicitPod) {
    return undefined;
  }

  for (const pattern of SERVICE_PATTERNS) {
    const value = rawMessage.match(pattern)?.[1];
    if (value && !value.includes('.')) {
      return value;
    }
  }

  return undefined;
}

function inferTargetResolutionSource(params: {
  hasTraceId: boolean;
  explicitPod: boolean;
  explicitService: boolean;
  explicitDomain: boolean;
  hasPromQL: boolean;
  businessHint?: string;
  issueSymptom: boolean;
  serviceStatusIntent: boolean;
  relationIntent: boolean;
}): TargetResolutionSource {
  const {
    hasTraceId,
    explicitPod,
    explicitService,
    explicitDomain,
    hasPromQL,
    businessHint,
    issueSymptom,
    serviceStatusIntent,
    relationIntent,
  } = params;

  if (hasTraceId) {
    return 'trace';
  }
  if (explicitPod) {
    return 'pod';
  }
  if (explicitService) {
    return 'service';
  }
  if (explicitDomain) {
    return 'domain';
  }
  if (hasPromQL) {
    return 'promql';
  }
  if (businessHint && (issueSymptom || serviceStatusIntent || relationIntent)) {
    return 'business_context';
  }
  return 'unresolved';
}

function inferValidationFocus(params: {
  hasPromQL: boolean;
  noDataSymptom: boolean;
  onlineMetricSymptom: boolean;
  targetResolutionSource: TargetResolutionSource;
  relationIntent: boolean;
  startupOrConfigFailure: boolean;
}): ValidationFocus {
  const {
    hasPromQL,
    noDataSymptom,
    onlineMetricSymptom,
    targetResolutionSource,
    relationIntent,
    startupOrConfigFailure,
  } = params;

  if (hasPromQL || noDataSymptom) {
    return 'query_correctness';
  }
  if (onlineMetricSymptom) {
    return 'symptom_truth';
  }
  if (targetResolutionSource === 'business_context' || relationIntent || targetResolutionSource === 'pod') {
    return 'entity_resolution';
  }
  if (startupOrConfigFailure) {
    return 'runtime_failure';
  }
  return 'telemetry_collection';
}

export function modelTurn(input: TurnInput): TurnModel {
  const rawMessage = input.message.trim();
  const normalizedMessage = rawMessage.toLowerCase();
  const detectedEntities: EntityRef[] = [];
  const businessHint = readContextString(input.context, 'business');

  const domain = rawMessage.match(DOMAIN_RE)?.[0];
  if (domain) {
    pushEntity(detectedEntities, { type: 'domain', value: domain, confidence: 'high' });
  }

  const pod = rawMessage.match(POD_RE)?.[1];
  if (pod) {
    pushEntity(detectedEntities, { type: 'pod', value: pod, confidence: 'high' });
  }

  const traceId = rawMessage.match(TRACE_RE)?.[1];
  const hasTraceId = Boolean(traceId);
  if (traceId) {
    pushEntity(detectedEntities, { type: 'trace', value: traceId, confidence: 'high' });
  }

  const hasPromQL = PROMQL_RE.test(rawMessage);
  if (hasPromQL) {
    pushEntity(detectedEntities, { type: 'promql', value: 'inline-promql', confidence: 'high' });
  }

  const service = detectService(rawMessage, Boolean(pod));
  if (service) {
    pushEntity(detectedEntities, { type: 'service', value: service, confidence: 'medium' });
  }

  const explicitService = detectedEntities.some((item) => item.type === 'service');
  const explicitPod = detectedEntities.some((item) => item.type === 'pod');
  const explicitDomain = detectedEntities.some((item) => item.type === 'domain');
  const relationIntent = RELATION_RE.test(rawMessage);
  const issueSymptom = ISSUE_RE.test(rawMessage);
  const noDataSymptom = NO_DATA_RE.test(rawMessage);
  const onlineMetricSymptom = ONLINE_METRIC_RE.test(rawMessage);
  const serviceStatusIntent = SERVICE_STATUS_RE.test(rawMessage);
  const startupOrConfigFailure = STARTUP_OR_CONFIG_RE.test(rawMessage);
  const collaborationHint = !businessHint
    && !hasPromQL
    && !hasTraceId
    && !explicitService
    && !explicitPod
    && !explicitDomain
    && issueSymptom
    && COLLABORATION_RE.test(rawMessage);
  const targetResolutionSource = inferTargetResolutionSource({
    hasTraceId,
    explicitPod,
    explicitService,
    explicitDomain,
    hasPromQL,
    businessHint,
    issueSymptom,
    serviceStatusIntent,
    relationIntent,
  });
  const validationFocus = inferValidationFocus({
    hasPromQL,
    noDataSymptom,
    onlineMetricSymptom,
    targetResolutionSource,
    relationIntent,
    startupOrConfigFailure,
  });
  const resolvableTarget = targetResolutionSource !== 'unresolved';

  return {
    rawMessage,
    normalizedMessage,
    detectedEntities,
    hasPromQL,
    hasTraceId,
    explicitService,
    explicitPod,
    explicitDomain,
    relationIntent,
    issueSymptom,
    noDataSymptom,
    onlineMetricSymptom,
    collaborationHint,
    serviceStatusIntent,
    startupOrConfigFailure,
    businessHint,
    targetResolutionSource,
    validationFocus,
    resolvableTarget,
  };
}
