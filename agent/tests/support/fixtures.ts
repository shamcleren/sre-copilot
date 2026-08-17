import type { CreateAlertInput } from '../../src/contracts.js';

/** 固定 fixture，避免核心测试依赖当前时间、网络或真实监控配置。 */
export const demoAlertInput: CreateAlertInput = {
  service: 'demo-service',
  alertName: 'http-5xx-rate',
  query: 'http_requests_total{service="demo-service",status=~"5.."}',
  threshold: 0.05,
  windowMinutes: 5,
};
