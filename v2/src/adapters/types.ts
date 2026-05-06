import type { BlockerCode, RuntimeToolCall, RuntimeToolExecution, ToolClass } from '../contracts';

export interface RuntimeAdapterExecuteOptions {
  adapterContext?: Record<string, unknown>;
}

export interface RuntimeAdapter {
  name: string;
  description: string;
  execute(toolCall: RuntimeToolCall, options?: RuntimeAdapterExecuteOptions): Promise<RuntimeToolExecution>;
}

function inferToolClass(toolCall: RuntimeToolCall): ToolClass {
  if (toolCall.toolClass) {
    return toolCall.toolClass;
  }
  if (/relation/i.test(toolCall.toolName)) {
    return 'relation';
  }
  return 'unify_query';
}

function buildUnavailableExecution(toolCall: RuntimeToolCall): RuntimeToolExecution {
  const blockerCode: BlockerCode = 'adapter_unavailable';
  return {
    toolName: toolCall.toolName,
    toolClass: inferToolClass(toolCall),
    summary: toolCall.summary,
    params: toolCall.params ?? {},
    success: false,
    error: '占位 adapter 尚未接入真实工具执行器。',
    blockerCode,
    durationMs: 0,
  };
}

export const noopAdapter: RuntimeAdapter = {
  name: 'noop',
  description: '占位 adapter，后续用于接入 V1 HTTP 或真实工具执行器。',
  async execute(toolCall) {
    return buildUnavailableExecution(toolCall);
  },
};
