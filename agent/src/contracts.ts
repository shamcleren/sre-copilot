/**
 * Phase 1 的最小领域合同。
 *
 * 实现顺序：先让这些类型稳定，再实现 plan、adapter 和 core。
 * 本文件只描述数据，不读取文件、不访问网络、不产生副作用。
 * 复杂状态、持久化字段和真实平台字段等核心链路稳定后再增加。
 */

export type PlanStatus =
  | 'DRAFT'
  | 'READY'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED';

export interface CreateAlertInput {
  service: string;
  alertName: string;
  query: string;
  threshold: number;
  windowMinutes: number;
}

export interface AlertRule {
  service: string;
  name: string;
  query: string;
  threshold: number;
  windowMinutes: number;
  enabled: boolean;
}

export interface AlertDiff {
  kind: 'add' | 'none';
  summary: string;
}

export interface AlertPlan {
  id: string;
  operation: 'alert.create';
  input: CreateAlertInput;
  current: AlertRule | null;
  desired: AlertRule;
  diff: AlertDiff;
  status: PlanStatus;
  planHash: string;
}

export interface Approval {
  id: string;
  planId: string;
  planHash: string;
  actorId: string;
}

export type AuditEventType =
  | 'PLAN_CREATED'
  | 'APPROVED'
  | 'EXECUTED'
  | 'VERIFIED'
  | 'FAILED';

export interface AuditEvent {
  type: AuditEventType;
  planId: string;
  message: string;
}

export interface AlertAdapter {
  inspect(service: string, alertName: string): Promise<AlertRule | null>;
  create(rule: AlertRule): Promise<AlertRule>;
  verify(rule: AlertRule): Promise<boolean>;
}

export interface AlertExecutionResult {
  status: 'SUCCEEDED' | 'FAILED';
  audit: AuditEvent[];
}

export interface SreCore {
  proposeAlert(input: CreateAlertInput): Promise<AlertPlan>;
  previewAlert(planId: string): AlertPlan;
  approveAlert(planId: string, actorId: string): Approval;
  executeAlert(planId: string, approvalId: string): Promise<AlertExecutionResult>;
}
