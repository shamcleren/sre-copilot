import type { BlockerCode, RuntimeToolCall, RuntimeToolExecution, ToolClass } from '../contracts';
import { executeUnifyQueryTool, type UnifyQueryAdapterContext } from './unify-query-client';
import type { RuntimeAdapter, RuntimeAdapterExecuteOptions } from './types';

const TOOL_CLASSES: Record<string, ToolClass> = {
  query_metrics: 'unify_query',
  query_promql: 'unify_query',
  query_trace: 'unify_query',
  query_log: 'unify_query',
  query_relation_multi_resource: 'relation',
  query_relation_multi_resource_range: 'relation',
};

function classifyFailure(status?: number, error?: string): BlockerCode {
  const normalizedError = String(error || '').toLowerCase();
  if (status === 401 || /unauthorized|token|auth/i.test(normalizedError)) {
    return 'authentication_failed';
  }
  if (status === 403 || /forbidden|permission|denied|无权限/i.test(normalizedError)) {
    return 'permission_denied';
  }
  if (status === 408 || /timeout|timed out|超时|abort/i.test(normalizedError)) {
    return 'tool_timeout';
  }
  return 'tool_error';
}

function inferToolClass(toolCall: RuntimeToolCall): ToolClass {
  return toolCall.toolClass ?? TOOL_CLASSES[toolCall.toolName] ?? 'unify_query';
}

function toAdapterContext(raw?: Record<string, unknown>): UnifyQueryAdapterContext | undefined {
  if (!raw) {
    return undefined;
  }

  const context: UnifyQueryAdapterContext = {};
  if (typeof raw.userId === 'string') context.userId = raw.userId;
  if (typeof raw.businessId === 'string') context.businessId = raw.businessId;
  if ('unifyQueryConfig' in raw) context.unifyQueryConfig = raw.unifyQueryConfig;
  return Object.keys(context).length > 0 ? context : undefined;
}

export function createUnifyQueryRuntimeAdapter(): RuntimeAdapter {
  return {
    name: 'unify-query',
    description: '通过 UnifyQuery API 处理实时遥测与关系查询。',
    async execute(toolCall: RuntimeToolCall, options?: RuntimeAdapterExecuteOptions): Promise<RuntimeToolExecution> {
      const toolClass = inferToolClass(toolCall);
      const startedAt = Date.now();
      const result = await executeUnifyQueryTool(
        toolCall.toolName,
        toolCall.params ?? {},
        toAdapterContext(options?.adapterContext),
      );
      return {
        toolName: toolCall.toolName,
        toolClass,
        summary: toolCall.summary,
        params: toolCall.params ?? {},
        success: Boolean(result.success),
        status: result.status,
        data: result.data,
        error: result.error,
        blockerCode: result.success ? undefined : classifyFailure(result.status, result.error),
        durationMs: Date.now() - startedAt,
      };
    },
  };
}
