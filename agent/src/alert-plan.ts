import type {
  AlertDiff,
  AlertPlan,
  AlertRule,
  CreateAlertInput,
} from './contracts.js';

/**
 * 把用户输入转换成 adapter 能理解的目标规则。
 *
 * 实现要求：只做字段映射，不在这里做 I/O 或 policy 判断。
 * 目标规则的字段必须来自 input，默认 enabled 为 true。
 */
export function buildAlertRule(input: CreateAlertInput): AlertRule {
  throw new Error('Not implemented: buildAlertRule');
}

/**
 * 生成用户能读懂的最小 diff。
 *
 * v0 只有两种结果：没有当前规则时 add；已有规则时 noop。
 * 更新已有规则、字段级 diff 和冲突策略放到后续阶段，不要在此处猜测覆盖行为。
 */
export function summarizeAlertDiff(
  current: AlertRule | null,
  desired: AlertRule,
): AlertDiff {
  throw new Error('Not implemented: summarizeAlertDiff');
}

/**
 * 创建一次受控写入计划。
 *
 * 实现顺序：buildAlertRule → summarizeAlertDiff → 生成稳定 id → 返回 DRAFT。
 * planHash 由 plan-policy.ts 统一计算，本函数不要自行 hash 或读取当前时间。
 */
export function createAlertPlan(
  input: CreateAlertInput,
  current: AlertRule | null,
): AlertPlan {
  throw new Error('Not implemented: createAlertPlan');
}
