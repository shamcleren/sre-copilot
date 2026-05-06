export type InvestigationMode =
  | 'request_evidence'
  | 'continue_investigation'
  | 'collaborative_request';

export type ToolClass = 'unify_query' | 'relation' | 'knowledge' | 'k8s' | 'ssh';

export type EvidenceType =
  | 'service_resolution'
  | 'runtime_signal'
  | 'query_artifact'
  | 'gap'
  | 'user_supplied'
  | 'tool_result'
  | 'tool_failure';

export type BlockerCode =
  | 'missing_target'
  | 'insufficient_context'
  | 'empty_result'
  | 'tool_timeout'
  | 'authentication_failed'
  | 'permission_denied'
  | 'tool_error'
  | 'adapter_unavailable';

export type TargetResolutionSource =
  | 'service'
  | 'pod'
  | 'domain'
  | 'promql'
  | 'trace'
  | 'business_context'
  | 'unresolved';

export type ValidationFocus =
  | 'query_correctness'
  | 'symptom_truth'
  | 'entity_resolution'
  | 'runtime_failure'
  | 'telemetry_collection';

export interface RuntimeToolCall {
  toolName: string;
  toolClass?: ToolClass;
  summary?: string;
  params?: Record<string, unknown>;
}

export interface TurnInput {
  message: string;
  context?: Record<string, unknown>;
  toolRequests?: RuntimeToolCall[];
}

export interface EntityRef {
  type: 'service' | 'pod' | 'domain' | 'promql' | 'trace';
  value: string;
  confidence: 'high' | 'medium';
}

export interface TurnModel {
  rawMessage: string;
  normalizedMessage: string;
  detectedEntities: EntityRef[];
  hasPromQL: boolean;
  hasTraceId: boolean;
  explicitService: boolean;
  explicitPod: boolean;
  explicitDomain: boolean;
  relationIntent: boolean;
  issueSymptom: boolean;
  noDataSymptom: boolean;
  onlineMetricSymptom: boolean;
  collaborationHint: boolean;
  serviceStatusIntent: boolean;
  startupOrConfigFailure: boolean;
  businessHint?: string;
  targetResolutionSource: TargetResolutionSource;
  validationFocus: ValidationFocus;
  resolvableTarget: boolean;
}

export interface PlanStep {
  kind: 'select_playbook' | 'request_evidence' | 'invoke_tool' | 'build_conclusion';
  summary: string;
  toolClass?: ToolClass;
}

export interface EvidenceItem {
  type: EvidenceType;
  summary: string;
  source: 'input' | 'derived' | 'runtime' | 'adapter';
  confirmed: boolean;
}

export interface Blocker {
  code: BlockerCode;
  summary: string;
  missing?: string[];
  toolName?: string;
  retryable?: boolean;
}

export interface Conclusion {
  mode: InvestigationMode;
  summary: string;
  confirmedFacts: string[];
  hypotheses: string[];
  nextActions: string[];
  missingEvidence: string[];
  reply: string;
}

export interface RuntimeToolExecution {
  toolName: string;
  toolClass: ToolClass;
  summary?: string;
  params: Record<string, unknown>;
  success: boolean;
  status?: number;
  data?: unknown;
  error?: string;
  blockerCode?: BlockerCode;
  durationMs?: number;
}

export interface RuntimeResult {
  playbookId: string;
  mode: InvestigationMode;
  turnModel: TurnModel;
  selectedToolClasses: ToolClass[];
  plan: PlanStep[];
  evidence: EvidenceItem[];
  blocker?: Blocker;
  conclusion: Conclusion;
  toolExecutions: RuntimeToolExecution[];
  adapterName?: string;
}
