import type {
  AlertAdapter,
  SreCore,
} from './contracts.js';

export interface SreCoreDependencies {
  adapter: AlertAdapter;
}

/**
 * 创建最小 core facade。
 *
 * 需要维护三个进程内 Map：plans、approvals、audits。
 * proposeAlert 的顺序固定为 inspect → createAlertPlan → hash → policy → store。
 * previewAlert 只读；approveAlert 只创建 approval；executeAlert 才能调用 adapter.create。
 * apply 后必须调用 adapter.verify，verify 失败返回 FAILED，不得伪造 SUCCEEDED。
 */
export function createSreCore(dependencies: SreCoreDependencies): SreCore {
  throw new Error('Not implemented: createSreCore');
}
