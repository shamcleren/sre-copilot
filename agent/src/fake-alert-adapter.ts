import type { AlertAdapter, AlertRule } from './contracts.js';

/**
 * 离线 fake adapter，只模拟一个进程内告警表。
 *
 * 实现要求：Map key 使用 `${service}:${alertName}`；inspect 只读，create 写入，
 * verify 重新读取并比较目标规则。不要在 adapter 内实现 approval 或 policy。
 * 真实监控 adapter 后续实现同一个 port，不要修改 core facade 的调用方式。
 */
export class FakeAlertAdapter implements AlertAdapter {
  private readonly rules = new Map<string, AlertRule>();

  /** 返回当前规则；不存在时返回 null。 */
  async inspect(service: string, alertName: string): Promise<AlertRule | null> {
    throw new Error('Not implemented: FakeAlertAdapter.inspect');
  }

  /** 写入一条规则并返回实际写入结果。 */
  async create(rule: AlertRule): Promise<AlertRule> {
    throw new Error('Not implemented: FakeAlertAdapter.create');
  }

  /** 重新读取规则，确认 apply 的结果可见。 */
  async verify(rule: AlertRule): Promise<boolean> {
    throw new Error('Not implemented: FakeAlertAdapter.verify');
  }
}
