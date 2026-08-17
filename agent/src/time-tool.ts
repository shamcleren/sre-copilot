export interface TimeToolInput {
  /** 可选 IANA 时区，例如 Asia/Shanghai；不传则使用当前运行环境时区。 */
  timeZone?: string;
  /** Pi 接入时由宿主传入；没有配置时明确返回 not-configured。 */
  model?: string;
  /** 测试时注入固定时间；正常调用不传，使用系统时钟。 */
  now?: Date;
}

export interface TimeToolResult {
  timestamp: string;
  localTime: string;
  timeZone: string;
  utcOffset: string;
  model: string;
}

/**
 * 返回当前时间、IANA 时区、UTC 偏移和宿主模型标识。
 *
 * 这是第一个最小 tool：只读系统时钟和环境配置，不调用 LLM、不访问网络。
 * Pi 接入时把 tool 参数映射到 TimeToolInput，再把 TimeToolResult 放入 details。
 * 模型名不能从 JavaScript 自动推断；优先由 Pi 宿主显式传入或设置 PI_MODEL。
 */
export function getCurrentTime(input: TimeToolInput = {}): TimeToolResult {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const model =
    input.model?.trim() || process.env.PI_MODEL?.trim() || process.env.MODEL?.trim() || 'not-configured';
  const localTime = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone,
  }).format(now);
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(now).find((part) => part.type === 'timeZoneName');

  return {
    timestamp: now.toISOString(),
    localTime,
    timeZone,
    utcOffset: offsetPart?.value ?? 'GMT',
    model,
  };
}
