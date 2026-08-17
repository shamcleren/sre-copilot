import type { AlertPlan } from './contracts.js';

export type PlanDecision = 'confirm' | 'noop';

/**
 * v0 的确定性 policy：新建规则需要确认，已存在规则只返回 noop。
 * 不在这里调用 LLM，不读取 actor 权限，不连接外部服务。
 */
export function decideAlertPlan(plan: AlertPlan): PlanDecision {
  throw new Error('Not implemented: decideAlertPlan');
}

/**
 * 为 approval 绑定稳定计划指纹。
 *
 * 实现要求：JSON 输入只包含 operation、input、desired、diff，字段顺序固定；
 * 不包含 status、approval 或 audit，因为这些字段是执行过程产生的状态。
 * 使用 Node crypto.createHash('sha256')，不要引入第三方 hash 包。
 */
export function hashAlertPlan(plan: AlertPlan): string {
  throw new Error('Not implemented: hashAlertPlan');
}
