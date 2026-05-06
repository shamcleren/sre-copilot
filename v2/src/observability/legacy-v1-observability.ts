import { initDatabase, isDatabaseAvailable, query } from './database';

export interface LlmCallPhaseBreakdown {
  phase: 'intentInference' | 'toolPlanning' | 'replyGeneration' | 'other';
  label: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  totalTokens: number;
  byModel: Array<{
    model: string;
    requestType: string;
    taskType: string;
    count: number;
    avgLatencyMs: number;
    totalTokens: number;
  }>;
}

export interface TokenUsagePhaseBreakdown {
  phase: 'intentInference' | 'toolPlanning' | 'replyGeneration' | 'other';
  label: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  requestCount: number;
  avgPromptChars: number;
  avgSystemPromptChars: number;
  avgUserPromptChars: number;
  maxPromptChars: number;
  byProviderModel: Array<{
    provider: string;
    model: string;
    requestType: string;
    taskType: string;
    apiPath: string;
    endpoint: string;
    tokens: number;
    cost: number;
    count: number;
  }>;
}

export interface ToolExecutionBreakdownItem {
  toolName: string;
  toolKind: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
}

export interface V2RouteModeBreakdownItem {
  mode: string;
  count: number;
}

export interface V2RouteRuntimeSummary {
  databaseAvailable: boolean;
  totalAttempts: number;
  eligibleCount: number;
  handledV2Count: number;
  fallbackCount: number;
  streamCount: number;
  intentPhaseSamples: number;
  intentLlmEnabledSamples: number;
  v2RuntimeSamples: number;
  toolExecutionSamples: number;
  avgIntentInferMs: number;
  avgV2RouteMs: number;
  modes: V2RouteModeBreakdownItem[];
}

export interface V2RouteRuntimeSummaryQuery {
  startDate?: string | Date;
  endDate?: string | Date;
  userId?: string;
  sessionId?: string;
}

const PHASE_LABEL_MAP: Record<LlmCallPhaseBreakdown['phase'], string> = {
  intentInference: '意图识别',
  toolPlanning: '工具规划',
  replyGeneration: '回答生成',
  other: '其他',
};

function toInt(value: unknown): number {
  return parseInt(String(value || '0'), 10);
}

function toFloat(value: unknown): number {
  return parseFloat(String(value || '0'));
}

function normalizeDate(value?: string | Date): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function emptyRouteSummary(databaseAvailable: boolean): V2RouteRuntimeSummary {
  return {
    databaseAvailable,
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
  };
}

export async function getLlmCallLogStats(): Promise<{
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
  totalTokens: number;
  topModels: Array<{ model: string; count: number }>;
  todayCalls: number;
}> {
  if (!isDatabaseAvailable()) {
    return { totalCalls: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0, totalTokens: 0, topModels: [], todayCalls: 0 };
  }

  const overviewRows = await query<Record<string, unknown>>(`
    SELECT
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE status = 'success') as success_calls,
      COUNT(*) FILTER (WHERE status = 'error') as error_calls,
      COALESCE(AVG(latency_ms) FILTER (WHERE status = 'success'), 0) as avg_latency,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_calls
    FROM llm_call_log
  `);

  const topModelsRows = await query<Record<string, unknown>>(`
    SELECT model, COUNT(*) as count
    FROM llm_call_log
    GROUP BY model
    ORDER BY count DESC
    LIMIT 10
  `);

  const row = overviewRows[0] || {};
  return {
    totalCalls: toInt(row.total_calls),
    successCalls: toInt(row.success_calls),
    errorCalls: toInt(row.error_calls),
    avgLatencyMs: Math.round(toFloat(row.avg_latency)),
    totalTokens: toInt(row.total_tokens),
    topModels: topModelsRows.map((item) => ({
      model: String(item.model || ''),
      count: toInt(item.count),
    })),
    todayCalls: toInt(row.today_calls),
  };
}

export async function getLlmCallPhaseBreakdown(input?: {
  startDate?: string;
  endDate?: string;
}): Promise<LlmCallPhaseBreakdown[]> {
  if (!isDatabaseAvailable()) return [];

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input?.startDate) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(input.startDate);
  }
  if (input?.endDate) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(input.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const phaseCase = `
    CASE
      WHEN request_type = 'tool_planning' THEN 'toolPlanning'
      WHEN COALESCE(task_type, '') = 'task-analysis' THEN 'intentInference'
      WHEN request_type IN ('chat', 'wecom_chat', 'agent', 'agent_fallback', 'chatops') THEN 'replyGeneration'
      ELSE 'other'
    END
  `;

  const phaseRows = await query<Record<string, unknown>>(
    `SELECT
       ${phaseCase} AS phase,
       COUNT(*) as total_calls,
       COUNT(*) FILTER (WHERE status = 'success') as success_calls,
       COUNT(*) FILTER (WHERE status = 'error') as error_calls,
       COALESCE(AVG(latency_ms), 0) as avg_latency,
       COALESCE(MAX(latency_ms), 0) as max_latency,
       COALESCE(SUM(total_tokens), 0) as total_tokens
     FROM llm_call_log
     ${whereClause}
     GROUP BY ${phaseCase}`,
    params,
  );

  const detailRows = await query<Record<string, unknown>>(
    `SELECT
       ${phaseCase} AS phase,
       model,
       COALESCE(request_type, '') as request_type,
       COALESCE(task_type, '') as task_type,
       COUNT(*) as count,
       COALESCE(AVG(latency_ms), 0) as avg_latency,
       COALESCE(SUM(total_tokens), 0) as total_tokens
     FROM llm_call_log
     ${whereClause}
     GROUP BY ${phaseCase}, model, COALESCE(request_type, ''), COALESCE(task_type, '')
     ORDER BY ${phaseCase}, count DESC, total_tokens DESC`,
    params,
  );

  const detailMap = new Map<LlmCallPhaseBreakdown['phase'], LlmCallPhaseBreakdown['byModel']>();
  for (const row of detailRows) {
    const phase = String(row.phase || 'other') as LlmCallPhaseBreakdown['phase'];
    const list = detailMap.get(phase) || [];
    list.push({
      model: String(row.model || ''),
      requestType: String(row.request_type || ''),
      taskType: String(row.task_type || ''),
      count: toInt(row.count),
      avgLatencyMs: Math.round(toFloat(row.avg_latency)),
      totalTokens: toInt(row.total_tokens),
    });
    detailMap.set(phase, list);
  }

  return phaseRows
    .map((row) => {
      const phase = String(row.phase || 'other') as LlmCallPhaseBreakdown['phase'];
      return {
        phase,
        label: PHASE_LABEL_MAP[phase] || phase,
        totalCalls: toInt(row.total_calls),
        successCalls: toInt(row.success_calls),
        errorCalls: toInt(row.error_calls),
        avgLatencyMs: Math.round(toFloat(row.avg_latency)),
        maxLatencyMs: Math.round(toFloat(row.max_latency)),
        totalTokens: toInt(row.total_tokens),
        byModel: detailMap.get(phase) || [],
      } satisfies LlmCallPhaseBreakdown;
    })
    .sort((a, b) => b.totalCalls - a.totalCalls);
}

export async function getTokenUsagePhaseBreakdown(input: {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<TokenUsagePhaseBreakdown[]> {
  if (!isDatabaseAvailable()) return [];

  const { userId, startDate, endDate } = input;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(userId);
  }
  if (startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const phaseCase = `
    CASE
      WHEN request_type = 'tool_planning' THEN 'toolPlanning'
      WHEN COALESCE(metadata->>'taskType', '') = 'task-analysis' THEN 'intentInference'
      WHEN request_type IN ('chat', 'wecom_chat', 'agent', 'agent_fallback', 'chatops') THEN 'replyGeneration'
      ELSE 'other'
    END
  `;

  const phaseRows = await query<Record<string, unknown>>(
    `SELECT
      ${phaseCase} AS phase,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COALESCE(SUM(cost_estimate), 0) AS total_cost,
      COUNT(*) AS request_count,
      COALESCE(AVG(
        COALESCE((metadata->>'systemPromptLength')::numeric, 0)
        + COALESCE((metadata->>'userPromptLength')::numeric, 0)
      ), 0) AS avg_prompt_chars,
      COALESCE(AVG(COALESCE((metadata->>'systemPromptLength')::numeric, 0)), 0) AS avg_system_prompt_chars,
      COALESCE(AVG(COALESCE((metadata->>'userPromptLength')::numeric, 0)), 0) AS avg_user_prompt_chars,
      COALESCE(MAX(
        COALESCE((metadata->>'systemPromptLength')::numeric, 0)
        + COALESCE((metadata->>'userPromptLength')::numeric, 0)
      ), 0) AS max_prompt_chars
    FROM token_usage
    ${whereClause}
    GROUP BY ${phaseCase}`,
    params,
  );

  const detailRows = await query<Record<string, unknown>>(
    `SELECT
      ${phaseCase} AS phase,
      provider,
      model,
      request_type,
      COALESCE(metadata->>'taskType', '') AS task_type,
      COALESCE(metadata->>'apiPath', '') AS api_path,
      COALESCE(metadata->>'endpoint', '') AS endpoint,
      COALESCE(SUM(total_tokens), 0) AS tokens,
      COALESCE(SUM(cost_estimate), 0) AS cost,
      COUNT(*) AS count
    FROM token_usage
    ${whereClause}
    GROUP BY
      ${phaseCase},
      provider,
      model,
      request_type,
      COALESCE(metadata->>'taskType', ''),
      COALESCE(metadata->>'apiPath', ''),
      COALESCE(metadata->>'endpoint', '')
    ORDER BY ${phaseCase}, tokens DESC`,
    params,
  );

  const detailMap = new Map<TokenUsagePhaseBreakdown['phase'], TokenUsagePhaseBreakdown['byProviderModel']>();
  for (const row of detailRows) {
    const phase = String(row.phase || 'other') as TokenUsagePhaseBreakdown['phase'];
    const list = detailMap.get(phase) || [];
    list.push({
      provider: String(row.provider || ''),
      model: String(row.model || ''),
      requestType: String(row.request_type || ''),
      taskType: String(row.task_type || ''),
      apiPath: String(row.api_path || ''),
      endpoint: String(row.endpoint || ''),
      tokens: toInt(row.tokens),
      cost: toFloat(row.cost),
      count: toInt(row.count),
    });
    detailMap.set(phase, list);
  }

  return phaseRows
    .map((row) => {
      const phase = String(row.phase || 'other') as TokenUsagePhaseBreakdown['phase'];
      return {
        phase,
        label: PHASE_LABEL_MAP[phase] || phase,
        totalTokens: toInt(row.total_tokens),
        promptTokens: toInt(row.prompt_tokens),
        completionTokens: toInt(row.completion_tokens),
        totalCost: toFloat(row.total_cost),
        requestCount: toInt(row.request_count),
        avgPromptChars: Math.round(toFloat(row.avg_prompt_chars)),
        avgSystemPromptChars: Math.round(toFloat(row.avg_system_prompt_chars)),
        avgUserPromptChars: Math.round(toFloat(row.avg_user_prompt_chars)),
        maxPromptChars: Math.round(toFloat(row.max_prompt_chars)),
        byProviderModel: detailMap.get(phase) || [],
      } satisfies TokenUsagePhaseBreakdown;
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

export async function getToolCallLogStats(): Promise<{
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
  topTools: Array<{ toolName: string; count: number }>;
  todayCalls: number;
}> {
  if (!isDatabaseAvailable()) {
    return { totalCalls: 0, successCalls: 0, errorCalls: 0, avgLatencyMs: 0, topTools: [], todayCalls: 0 };
  }

  const overviewRows = await query<Record<string, unknown>>(
    `SELECT
       COUNT(*) as total_calls,
       COUNT(*) FILTER (WHERE success = TRUE) as success_calls,
       COUNT(*) FILTER (WHERE success = FALSE) as error_calls,
       COALESCE(AVG(latency_ms),0) as avg_latency,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_calls
     FROM tool_call_log`,
  );
  const topRows = await query<Record<string, unknown>>(
    `SELECT tool_name, COUNT(*) as count
     FROM tool_call_log
     GROUP BY tool_name
     ORDER BY count DESC
     LIMIT 10`,
  );
  const row = overviewRows[0] || {};
  return {
    totalCalls: toInt(row.total_calls),
    successCalls: toInt(row.success_calls),
    errorCalls: toInt(row.error_calls),
    avgLatencyMs: Math.round(toFloat(row.avg_latency)),
    topTools: topRows.map((item) => ({
      toolName: String(item.tool_name || ''),
      count: toInt(item.count),
    })),
    todayCalls: toInt(row.today_calls),
  };
}

export async function getToolExecutionBreakdown(limit = 5): Promise<ToolExecutionBreakdownItem[]> {
  if (!isDatabaseAvailable()) {
    return [];
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT
       tool_name,
       tool_kind,
       COUNT(*) as total_calls,
       COUNT(*) FILTER (WHERE success = TRUE) as success_calls,
       COUNT(*) FILTER (WHERE success = FALSE) as error_calls,
       COALESCE(AVG(latency_ms), 0) as avg_latency,
       COALESCE(MAX(latency_ms), 0) as max_latency
     FROM tool_call_log
     GROUP BY tool_name, tool_kind
     ORDER BY total_calls DESC, avg_latency DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((row) => ({
    toolName: String(row.tool_name || ''),
    toolKind: String(row.tool_kind || ''),
    totalCalls: toInt(row.total_calls),
    successCalls: toInt(row.success_calls),
    errorCalls: toInt(row.error_calls),
    avgLatencyMs: Math.round(toFloat(row.avg_latency)),
    maxLatencyMs: Math.round(toFloat(row.max_latency)),
  }));
}

function buildRouteSummaryQuery(input?: V2RouteRuntimeSummaryQuery): { whereSql: string; params: unknown[] } {
  const conditions = ['requested_route = $1'];
  const params: unknown[] = ['v2'];
  let idx = 2;

  const startDate = normalizeDate(input?.startDate);
  const endDate = normalizeDate(input?.endDate);
  const userId = String(input?.userId || '').trim();
  const sessionId = String(input?.sessionId || '').trim();

  if (startDate) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(endDate);
  }
  if (userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(userId);
  }
  if (sessionId) {
    conditions.push(`session_id = $${idx++}`);
    params.push(sessionId);
  }

  return {
    whereSql: `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

export async function getV2RouteRuntimeSummary(input?: V2RouteRuntimeSummaryQuery): Promise<V2RouteRuntimeSummary> {
  if (!isDatabaseAvailable()) {
    return emptyRouteSummary(false);
  }

  const { whereSql, params } = buildRouteSummaryQuery(input);

  try {
    const overviewRows = await query<Record<string, unknown>>(
      `SELECT
         COUNT(*) AS total_attempts,
         COUNT(*) FILTER (WHERE eligible = TRUE) AS eligible_count,
         COUNT(*) FILTER (WHERE actual_route = 'v2' AND handled = TRUE) AS handled_v2_count,
         COUNT(*) FILTER (WHERE fallback_to_v1 = TRUE) AS fallback_count,
         COUNT(*) FILTER (WHERE stream = TRUE) AS stream_count,
         COUNT(*) FILTER (WHERE COALESCE((phase_timings->>'intentInferMs')::numeric, 0) > 0) AS intent_phase_samples,
         COUNT(*) FILTER (WHERE COALESCE((llm_observability #>> '{intentInference,available}')::boolean, FALSE) = TRUE) AS intent_llm_enabled_samples,
         COUNT(*) FILTER (WHERE actual_route = 'v2' AND handled = TRUE AND COALESCE((phase_timings->>'v2RouteMs')::numeric, 0) > 0) AS v2_runtime_samples,
         COUNT(*) FILTER (WHERE actual_route = 'v2' AND handled = TRUE AND COALESCE((v2_runtime_observability->>'toolExecutionCount')::integer, 0) > 0) AS tool_execution_samples,
         COALESCE(AVG((phase_timings->>'intentInferMs')::numeric) FILTER (WHERE COALESCE((phase_timings->>'intentInferMs')::numeric, 0) > 0), 0) AS avg_intent_infer_ms,
         COALESCE(AVG((phase_timings->>'v2RouteMs')::numeric) FILTER (WHERE actual_route = 'v2' AND handled = TRUE AND COALESCE((phase_timings->>'v2RouteMs')::numeric, 0) > 0), 0) AS avg_v2_route_ms
       FROM chat_route_runtime_log
       ${whereSql}`,
      params,
    );

    const modeRows = await query<Record<string, unknown>>(
      `SELECT
         COALESCE(v2_runtime_observability->>'mode', 'unknown') AS mode,
         COUNT(*) AS count
       FROM chat_route_runtime_log
       ${whereSql} AND actual_route = 'v2' AND handled = TRUE
       GROUP BY COALESCE(v2_runtime_observability->>'mode', 'unknown')
       ORDER BY count DESC, mode ASC`,
      params,
    );

    const row = overviewRows[0] || {};
    return {
      databaseAvailable: true,
      totalAttempts: toInt(row.total_attempts),
      eligibleCount: toInt(row.eligible_count),
      handledV2Count: toInt(row.handled_v2_count),
      fallbackCount: toInt(row.fallback_count),
      streamCount: toInt(row.stream_count),
      intentPhaseSamples: toInt(row.intent_phase_samples),
      intentLlmEnabledSamples: toInt(row.intent_llm_enabled_samples),
      v2RuntimeSamples: toInt(row.v2_runtime_samples),
      toolExecutionSamples: toInt(row.tool_execution_samples),
      avgIntentInferMs: Math.round(toFloat(row.avg_intent_infer_ms)),
      avgV2RouteMs: Math.round(toFloat(row.avg_v2_route_ms)),
      modes: modeRows.map((modeRow) => ({
        mode: String(modeRow.mode || 'unknown'),
        count: toInt(modeRow.count),
      })),
    };
  } catch {
    return emptyRouteSummary(true);
  }
}

export {
  initDatabase,
  isDatabaseAvailable,
};
