/**
 * 唯一公开入口。
 *
 * 未来 Pi/Web/企微等 harness 只能从这里获取 core facade 和领域合同，
 * 不应深入 import alert-core 内部 Map，也不应直接持有 adapter 写方法。
 */
export { createSreCore } from './alert-core.js';
export { FakeAlertAdapter } from './fake-alert-adapter.js';
export { getCurrentTime } from './time-tool.js';
export type {
  AlertAdapter,
  AlertExecutionResult,
  AlertPlan,
  Approval,
  CreateAlertInput,
  SreCore,
} from './contracts.js';
export type { TimeToolInput, TimeToolResult } from './time-tool.js';
