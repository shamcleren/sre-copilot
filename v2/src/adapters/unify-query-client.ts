type JsonRecord = Record<string, unknown>;

type ToolHandlerResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  status?: number;
};

export interface UnifyQueryRuntimeConfig {
  baseUrl: string;
  headers: Record<string, string>;
  spaceUidTemplate: string;
  querySource?: string;
  skipSpaceValidation: boolean;
  timeoutMs: number;
}

export interface UnifyQueryAdapterContext {
  userId?: string;
  businessId?: string;
  unifyQueryConfig?: unknown;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.UNIFY_QUERY_TIMEOUT_MS || 15000);
const DEFAULT_SPACE_UID_TEMPLATE = 'bkcc__{businessId}';
const DEFAULT_QUERY_SOURCE_PREFIX = 'sre-copilot';
const BIZ_KEYS = ['bk_biz_id', 'bkBizId', 'biz_id', 'bizId', 'business_id', 'businessId', 'business'];

function isPlainObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return undefined;
}

function asOptionalInteger(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function parseHeaders(raw: unknown): Record<string, string> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const headerName = String(key || '').trim();
    const headerValue = asNonEmptyString(value);
    if (!headerName || !headerValue) continue;
    out[headerName] = headerValue;
  }
  return out;
}

function parseHeadersFromEnv(): Record<string, string> {
  const raw = process.env.UNIFY_QUERY_HEADERS_JSON;
  if (!raw) return {};
  try {
    return parseHeaders(JSON.parse(raw));
  } catch {
    return {};
  }
}

function parseConfigOverride(raw: unknown): Partial<UnifyQueryRuntimeConfig> {
  const input = isPlainObject(raw) ? raw : {};
  const override: Partial<UnifyQueryRuntimeConfig> = {};
  const baseUrl = asNonEmptyString(input.baseUrl) || asNonEmptyString(input.base_url);
  const spaceUidTemplate = asNonEmptyString(input.spaceUidTemplate) || asNonEmptyString(input.space_uid_template);
  const querySource = asNonEmptyString(input.querySource) || asNonEmptyString(input.query_source);
  const skipSpaceValidation = asOptionalBoolean(input.skipSpaceValidation) ?? asOptionalBoolean(input.skip_space_validation);
  const timeoutMs = asOptionalInteger(input.timeoutMs) ?? asOptionalInteger(input.timeout_ms);
  if (baseUrl) override.baseUrl = baseUrl.replace(/\/+$/, '');
  const headers = parseHeaders(input.headers);
  if (Object.keys(headers).length > 0) override.headers = headers;
  if (spaceUidTemplate) override.spaceUidTemplate = spaceUidTemplate;
  if (querySource) override.querySource = querySource;
  if (skipSpaceValidation !== undefined) override.skipSpaceValidation = skipSpaceValidation;
  if (timeoutMs !== undefined) override.timeoutMs = Math.max(timeoutMs, 1000);
  return override;
}

function mergeRuntimeConfig(base: UnifyQueryRuntimeConfig, override?: Partial<UnifyQueryRuntimeConfig>): UnifyQueryRuntimeConfig {
  if (!override) return base;
  return {
    baseUrl: override.baseUrl || base.baseUrl,
    headers: override.headers ? { ...base.headers, ...override.headers } : { ...base.headers },
    spaceUidTemplate: override.spaceUidTemplate || base.spaceUidTemplate,
    querySource: override.querySource ?? base.querySource,
    skipSpaceValidation: override.skipSpaceValidation ?? base.skipSpaceValidation,
    timeoutMs: override.timeoutMs ?? base.timeoutMs,
  };
}

function resolveRuntimeConfig(raw?: unknown): { runtimeConfig: UnifyQueryRuntimeConfig; configSource: string } {
  const envConfig = parseConfigOverride({
    baseUrl: process.env.UNIFY_QUERY_BASE_URL,
    headers: parseHeadersFromEnv(),
    spaceUidTemplate: process.env.UNIFY_QUERY_SPACE_UID_TEMPLATE,
    querySource: process.env.UNIFY_QUERY_QUERY_SOURCE,
    skipSpaceValidation: process.env.UNIFY_QUERY_SKIP_SPACE_VALIDATION,
    timeoutMs: process.env.UNIFY_QUERY_TIMEOUT_MS,
  });
  const contextConfig = parseConfigOverride(raw);
  const runtimeConfig = mergeRuntimeConfig(
    mergeRuntimeConfig(
      {
        baseUrl: '',
        headers: {},
        spaceUidTemplate: DEFAULT_SPACE_UID_TEMPLATE,
        querySource: undefined,
        skipSpaceValidation: false,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      envConfig,
    ),
    contextConfig,
  );

  const configSource = Object.keys(contextConfig).length > 0
    ? 'adapterContext.unifyQueryConfig'
    : Object.keys(envConfig).length > 0
      ? 'environment'
      : 'none';

  return { runtimeConfig, configSource };
}

function resolveSpaceUid(explicitSpaceUid: unknown, template: string, businessId?: string): string | undefined {
  const direct = asNonEmptyString(explicitSpaceUid);
  if (direct) return direct;
  if (!businessId) return undefined;
  const rendered = template
    .replace(/\{businessId\}/g, businessId)
    .replace(/\$\{businessId\}/g, businessId)
    .trim();
  return rendered || undefined;
}

function cloneRequestObject(raw: unknown): JsonRecord {
  return isPlainObject(raw) ? { ...raw } : {};
}

function setIfDefined(target: JsonRecord, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  target[key] = value;
}

function normalizeQueryList(raw: unknown): unknown[] | undefined {
  return Array.isArray(raw) ? raw : undefined;
}

function normalizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .map((item) => asNonEmptyString(item))
    .filter((item): item is string => Boolean(item));
  return values.length ? values : [];
}

function normalizeJsonArray(raw: unknown): unknown[] | undefined {
  return Array.isArray(raw) ? [...raw] : undefined;
}

function buildQueryTsBody(params: JsonRecord): JsonRecord {
  if (isPlainObject(params.request)) {
    return cloneRequestObject(params.request);
  }
  const body: JsonRecord = {};
  const queryList = normalizeQueryList(params.queryList) || normalizeQueryList(params.query_list);
  setIfDefined(body, 'query_list', queryList);
  setIfDefined(body, 'metric_merge', asNonEmptyString(params.metricMerge) || asNonEmptyString(params.metric_merge) || (queryList?.length ? 'a' : undefined));
  setIfDefined(body, 'result_columns', normalizeQueryList(params.resultColumns) || normalizeQueryList(params.result_columns));
  setIfDefined(body, 'start_time', asNonEmptyString(params.startTime) || asNonEmptyString(params.start_time));
  setIfDefined(body, 'end_time', asNonEmptyString(params.endTime) || asNonEmptyString(params.end_time));
  setIfDefined(body, 'step', asNonEmptyString(params.step));
  setIfDefined(body, 'timezone', asNonEmptyString(params.timezone));
  setIfDefined(body, 'down_sample_range', asNonEmptyString(params.downSampleRange) || asNonEmptyString(params.down_sample_range));
  setIfDefined(body, 'look_back_delta', asNonEmptyString(params.lookBackDelta) || asNonEmptyString(params.look_back_delta));
  setIfDefined(body, 'limit', asOptionalInteger(params.limit));
  setIfDefined(body, 'from', asOptionalInteger(params.from));
  setIfDefined(body, 'scroll', asNonEmptyString(params.scroll));
  setIfDefined(body, 'slice_max', asOptionalInteger(params.sliceMax) || asOptionalInteger(params.slice_max));
  setIfDefined(body, 'is_multi_from', asOptionalBoolean(params.isMultiFrom) ?? asOptionalBoolean(params.is_multi_from));
  setIfDefined(body, 'is_search_after', asOptionalBoolean(params.isSearchAfter) ?? asOptionalBoolean(params.is_search_after));
  setIfDefined(body, 'clear_cache', asOptionalBoolean(params.clearCache) ?? asOptionalBoolean(params.clear_cache));
  setIfDefined(body, 'instant', asOptionalBoolean(params.instant));
  setIfDefined(body, 'reference', asOptionalBoolean(params.reference));
  setIfDefined(body, 'not_time_align', asOptionalBoolean(params.notTimeAlign) ?? asOptionalBoolean(params.not_time_align));
  setIfDefined(body, 'dry_run', asOptionalBoolean(params.dryRun) ?? asOptionalBoolean(params.dry_run));
  setIfDefined(body, 'is_merge_db', asOptionalBoolean(params.isMergeDb) ?? asOptionalBoolean(params.is_merge_db));
  setIfDefined(body, 'order_by', normalizeQueryList(params.orderBy) || normalizeQueryList(params.order_by));
  setIfDefined(body, 'highlight', isPlainObject(params.highlight) ? params.highlight : undefined);
  setIfDefined(body, 'result_table_options', isPlainObject(params.resultTableOptions) ? params.resultTableOptions : params.result_table_options);
  setIfDefined(body, 'add_dimensions', normalizeQueryList(params.addDimensions) || normalizeQueryList(params.add_dimensions));
  return body;
}

function buildPromqlBody(params: JsonRecord): JsonRecord {
  if (isPlainObject(params.request)) {
    return cloneRequestObject(params.request);
  }
  const body: JsonRecord = {};
  setIfDefined(body, 'promql', asNonEmptyString(params.promql));
  setIfDefined(body, 'start', asNonEmptyString(params.start) || asNonEmptyString(params.startTime) || asNonEmptyString(params.start_time));
  setIfDefined(body, 'end', asNonEmptyString(params.end) || asNonEmptyString(params.endTime) || asNonEmptyString(params.end_time));
  setIfDefined(body, 'step', asNonEmptyString(params.step));
  setIfDefined(body, 'timezone', asNonEmptyString(params.timezone));
  setIfDefined(body, 'look_back_delta', asNonEmptyString(params.lookBackDelta) || asNonEmptyString(params.look_back_delta));
  setIfDefined(body, 'instant', asOptionalBoolean(params.instant));
  setIfDefined(body, 'bk_biz_ids', Array.isArray(params.bkBizIds) ? params.bkBizIds : params.bk_biz_ids);
  return body;
}

function mergeTraceConditions(rawConditions: unknown, traceFieldName: string, traceIds: string[]): JsonRecord | undefined {
  const merged = isPlainObject(rawConditions) ? { ...rawConditions } : {};
  const fieldList = Array.isArray(merged.field_list) ? [...merged.field_list] : [];
  const conditionList = Array.isArray(merged.condition_list) ? [...merged.condition_list] : [];
  if (traceIds.length > 0) {
    fieldList.push({
      field_name: traceFieldName,
      value: traceIds,
      op: 'eq',
    });
  }
  if (fieldList.length > 0) merged.field_list = fieldList;
  if (conditionList.length > 0) merged.condition_list = conditionList;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildFlowRawBody(params: JsonRecord, traceFieldFallback: string): JsonRecord {
  if (isPlainObject(params.request)) {
    return cloneRequestObject(params.request);
  }

  const ids = [
    asNonEmptyString(params.traceId) || asNonEmptyString(params.trace_id),
    asNonEmptyString(params.logId) || asNonEmptyString(params.log_id),
    ...(
      normalizeStringArray(params.traceIds)
      || normalizeStringArray(params.trace_ids)
      || normalizeStringArray(params.logIds)
      || normalizeStringArray(params.log_ids)
      || []
    ),
  ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

  const traceFieldName = asNonEmptyString(params.traceFieldName) || asNonEmptyString(params.trace_field_name) || traceFieldFallback;
  const queryItem: JsonRecord = {};
  setIfDefined(queryItem, 'data_source', asNonEmptyString(params.dataSource) || asNonEmptyString(params.data_source));
  setIfDefined(queryItem, 'table_id', asNonEmptyString(params.tableId) || asNonEmptyString(params.table_id));
  setIfDefined(queryItem, 'is_regexp', asOptionalBoolean(params.isRegexp) ?? asOptionalBoolean(params.is_regexp) ?? false);
  setIfDefined(queryItem, 'function', normalizeJsonArray(params.function) || []);
  setIfDefined(
    queryItem,
    'time_aggregation',
    isPlainObject(params.timeAggregation)
      ? params.timeAggregation
      : isPlainObject(params.time_aggregation)
        ? params.time_aggregation
        : {},
  );
  setIfDefined(queryItem, 'is_dom_sampled', asOptionalBoolean(params.isDomSampled) ?? asOptionalBoolean(params.is_dom_sampled) ?? false);
  setIfDefined(queryItem, 'reference_name', asNonEmptyString(params.referenceName) || asNonEmptyString(params.reference_name) || 'a');
  setIfDefined(queryItem, 'conditions', mergeTraceConditions(params.conditions, traceFieldName, ids));
  setIfDefined(queryItem, 'query_string', asNonEmptyString(params.queryString) || asNonEmptyString(params.query_string) || '*');
  setIfDefined(queryItem, 'sql', asNonEmptyString(params.sql) || '');
  setIfDefined(queryItem, 'is_prefix', asOptionalBoolean(params.isPrefix) ?? asOptionalBoolean(params.is_prefix) ?? false);

  const body: JsonRecord = {
    query_list: [queryItem],
  };
  setIfDefined(body, 'metric_merge', asNonEmptyString(params.metricMerge) || asNonEmptyString(params.metric_merge) || 'a');
  setIfDefined(body, 'order_by', normalizeStringArray(params.orderBy) || normalizeStringArray(params.order_by) || ['start_time']);
  setIfDefined(body, 'start_time', asNonEmptyString(params.startTime) || asNonEmptyString(params.start_time));
  setIfDefined(body, 'end_time', asNonEmptyString(params.endTime) || asNonEmptyString(params.end_time));
  setIfDefined(body, 'step', asNonEmptyString(params.step) || '60s');
  setIfDefined(body, 'timezone', asNonEmptyString(params.timezone) || 'Asia/Shanghai');
  setIfDefined(body, 'instant', asOptionalBoolean(params.instant) ?? false);
  setIfDefined(body, 'not_time_align', asOptionalBoolean(params.notTimeAlign) ?? asOptionalBoolean(params.not_time_align) ?? false);
  setIfDefined(body, 'limit', asOptionalInteger(params.limit) || 1000);
  return body;
}

function buildRelationQueryItem(raw: unknown, isRange: boolean): JsonRecord {
  const input = isPlainObject(raw) ? raw : {};
  const item: JsonRecord = {};
  if (isRange) {
    setIfDefined(item, 'start_time', asOptionalInteger(input.startTime) ?? asOptionalInteger(input.start_time));
    setIfDefined(item, 'end_time', asOptionalInteger(input.endTime) ?? asOptionalInteger(input.end_time));
    setIfDefined(item, 'step', asNonEmptyString(input.step));
  } else {
    setIfDefined(item, 'timestamp', asOptionalInteger(input.timestamp) ?? asOptionalInteger(input.time));
  }
  setIfDefined(item, 'source_type', asNonEmptyString(input.sourceType) || asNonEmptyString(input.source_type));
  setIfDefined(item, 'source_info', isPlainObject(input.sourceInfo) ? input.sourceInfo : input.source_info);
  setIfDefined(item, 'source_expand_info', isPlainObject(input.sourceExpandInfo) ? input.sourceExpandInfo : input.source_expand_info);
  setIfDefined(item, 'target_type', asNonEmptyString(input.targetType) || asNonEmptyString(input.target_type));
  setIfDefined(item, 'target_info_show', asOptionalBoolean(input.targetInfoShow) ?? asOptionalBoolean(input.target_info_show));
  setIfDefined(item, 'path_resource', normalizeStringArray(input.pathResource) || normalizeStringArray(input.path_resource));
  setIfDefined(item, 'look_back_delta', asNonEmptyString(input.lookBackDelta) || asNonEmptyString(input.look_back_delta));
  return item;
}

function buildRelationBody(params: JsonRecord, isRange: boolean): JsonRecord {
  if (isPlainObject(params.request)) {
    return cloneRequestObject(params.request);
  }
  const body: JsonRecord = {};
  const queryListRaw = normalizeQueryList(params.queryList) || normalizeQueryList(params.query_list);
  if (queryListRaw) {
    body.query_list = queryListRaw.map((item) => buildRelationQueryItem(item, isRange));
    return body;
  }
  body.query_list = [buildRelationQueryItem(params, isRange)];
  return body;
}

function validateCommonQueryTsBody(body: JsonRecord): string | null {
  if (!Array.isArray(body.query_list) || body.query_list.length === 0) {
    return 'query_list 不能为空';
  }
  if (!asNonEmptyString(body.start_time)) {
    return 'start_time 不能为空';
  }
  if (!asNonEmptyString(body.end_time)) {
    return 'end_time 不能为空';
  }
  return null;
}

function validatePromqlBody(body: JsonRecord): string | null {
  if (!asNonEmptyString(body.promql)) {
    return 'promql 不能为空';
  }
  if (asOptionalBoolean(body.instant) === true) {
    return null;
  }
  if (!asNonEmptyString(body.start)) {
    return 'start 不能为空';
  }
  if (!asNonEmptyString(body.end)) {
    return 'end 不能为空';
  }
  return null;
}

function validateRelationBody(body: JsonRecord, isRange: boolean): string | null {
  if (!Array.isArray(body.query_list) || body.query_list.length === 0) {
    return 'query_list 不能为空';
  }

  for (const [index, item] of body.query_list.entries()) {
    if (!isPlainObject(item)) {
      return `query_list[${index}] 必须是对象`;
    }
    if (!asNonEmptyString(item.source_type) && !isPlainObject(item.source_info)) {
      return `query_list[${index}] 至少需要提供 source_type 或 source_info`;
    }
    if (isRange) {
      if (asOptionalInteger(item.start_time) === undefined) {
        return `query_list[${index}].start_time 不能为空`;
      }
      if (asOptionalInteger(item.end_time) === undefined) {
        return `query_list[${index}].end_time 不能为空`;
      }
      if (!asNonEmptyString(item.step)) {
        return `query_list[${index}].step 不能为空`;
      }
    } else if (asOptionalInteger(item.timestamp) === undefined) {
      return `query_list[${index}].timestamp 不能为空`;
    }
  }

  return null;
}

function extractBusinessIdFromParams(params: JsonRecord = {}): string | undefined {
  for (const key of BIZ_KEYS) {
    const value = asNonEmptyString(params[key]);
    if (value) return value;
  }

  for (const wrapperKey of ['body_param', 'query_param']) {
    const nested = params[wrapperKey];
    if (!nested || typeof nested !== 'object') continue;
    for (const key of BIZ_KEYS) {
      const value = asNonEmptyString((nested as JsonRecord)[key]);
      if (value) return value;
    }
  }

  return undefined;
}

function resolveEffectiveBusinessId(context?: UnifyQueryAdapterContext, params?: JsonRecord): string | undefined {
  const fromContext = asNonEmptyString(context?.businessId);
  if (fromContext) return fromContext;
  return extractBusinessIdFromParams(params || {});
}

function resolveQuerySource(params: JsonRecord, config: UnifyQueryRuntimeConfig, context?: UnifyQueryAdapterContext): string {
  return (
    asNonEmptyString(params.querySource)
    || asNonEmptyString(params.query_source)
    || config.querySource
    || `${DEFAULT_QUERY_SOURCE_PREFIX}:${context?.userId || 'anonymous'}`
  );
}

async function callUnifyQueryApi(input: {
  toolName: string;
  endpoint: string;
  params: JsonRecord;
  buildBody: (params: JsonRecord) => JsonRecord;
  validateBody?: (body: JsonRecord) => string | null;
  includeSpaceUidInBody?: boolean;
  context?: UnifyQueryAdapterContext;
}): Promise<ToolHandlerResult> {
  const effectiveBusinessId = resolveEffectiveBusinessId(input.context, input.params);
  const { runtimeConfig, configSource } = resolveRuntimeConfig(input.context?.unifyQueryConfig);

  if (!runtimeConfig.baseUrl) {
    return {
      success: false,
      error: '未配置 UnifyQuery。请通过 adapterContext.unifyQueryConfig 或环境变量提供 baseUrl / headers / spaceUidTemplate',
    };
  }

  if (!/^https?:\/\//i.test(runtimeConfig.baseUrl)) {
    return {
      success: false,
      error: `UnifyQuery baseUrl 非法: ${runtimeConfig.baseUrl}`,
    };
  }

  const spaceUid = resolveSpaceUid(input.params.spaceUid ?? input.params.space_uid, runtimeConfig.spaceUidTemplate, effectiveBusinessId);
  if (!spaceUid) {
    return {
      success: false,
      error: '无法解析 spaceUid。请传入 spaceUid，或提供 businessId 以便按 spaceUidTemplate 生成。',
    };
  }

  const body = input.buildBody(input.params);
  if (input.includeSpaceUidInBody !== false) {
    body.space_uid = spaceUid;
  }

  const validationError = input.validateBody?.(body);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const querySource = resolveQuerySource(input.params, runtimeConfig, input.context);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...runtimeConfig.headers,
    'Bk-Query-Source': querySource,
    'X-Bk-Scope-Space-Uid': spaceUid,
  };
  if (runtimeConfig.skipSpaceValidation) {
    headers['X-Bk-Scope-Skip-Space'] = 'true';
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(asOptionalInteger(input.params.timeoutMs) || runtimeConfig.timeoutMs || DEFAULT_TIMEOUT_MS, 1000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${runtimeConfig.baseUrl}${input.endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `UnifyQuery 请求失败 (${response.status})`,
        data: parsed,
      };
    }

    return {
      success: true,
      status: response.status,
      data: {
        businessId: effectiveBusinessId || null,
        spaceUid,
        querySource,
        endpoint: input.endpoint,
        configSource,
        result: parsed,
      },
    };
  } catch (error) {
    const message = error instanceof Error
      ? error.name === 'AbortError'
        ? 'timeout'
        : error.message
      : String(error);
    return {
      success: false,
      error: `UnifyQuery 请求异常: ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function executeUnifyQueryTool(
  toolName: string,
  params: JsonRecord,
  context?: UnifyQueryAdapterContext,
): Promise<ToolHandlerResult> {
  switch (toolName) {
    case 'query_metrics':
      return callUnifyQueryApi({
        toolName,
        endpoint: '/query/ts',
        params,
        context,
        buildBody: buildQueryTsBody,
        validateBody: validateCommonQueryTsBody,
      });
    case 'query_promql':
      return callUnifyQueryApi({
        toolName,
        endpoint: '/query/promql',
        params,
        context,
        buildBody: buildPromqlBody,
        validateBody: validatePromqlBody,
        includeSpaceUidInBody: false,
      });
    case 'query_trace':
      return callUnifyQueryApi({
        toolName,
        endpoint: '/query/ts/raw',
        params,
        context,
        buildBody: (input) => buildFlowRawBody(input, 'trace_id'),
        validateBody: validateCommonQueryTsBody,
      });
    case 'query_log':
      return callUnifyQueryApi({
        toolName,
        endpoint: '/query/ts/raw',
        params,
        context,
        buildBody: (input) => buildFlowRawBody(input, 'trace_id'),
        validateBody: validateCommonQueryTsBody,
      });
    case 'query_relation_multi_resource':
      return callUnifyQueryApi({
        toolName,
        endpoint: '/relation/multi_resource_query',
        params,
        context,
        buildBody: (input) => buildRelationBody(input, false),
        validateBody: (body) => validateRelationBody(body, false),
        includeSpaceUidInBody: false,
      });
    case 'query_relation_multi_resource_range':
      return callUnifyQueryApi({
        toolName,
        endpoint: '/relation/multi_resource_query_range',
        params,
        context,
        buildBody: (input) => buildRelationBody(input, true),
        validateBody: (body) => validateRelationBody(body, true),
        includeSpaceUidInBody: false,
      });
    default:
      return {
        success: false,
        error: `unify_query adapter 暂不支持工具 ${toolName}`,
      };
  }
}
