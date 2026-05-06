import type { EvidenceType, TargetResolutionSource, ToolClass, ValidationFocus } from '../contracts';

export interface TroubleshootingPlaybook {
  id: string;
  entryConditions: string[];
  requiredEvidence: EvidenceType[];
  allowedTools: ToolClass[];
  locatorSources: TargetResolutionSource[];
  relationResolutionSources: TargetResolutionSource[];
  validationPriority: ValidationFocus[];
  fallback: 'request_evidence';
  conclusionSections: string[];
}

export const troubleshootingPlaybook: TroubleshootingPlaybook = {
  id: 'troubleshooting-core',
  entryConditions: ['service', 'pod', 'domain', 'promql', 'trace', 'business-context', 'sre-question'],
  requiredEvidence: ['service_resolution', 'runtime_signal'],
  allowedTools: ['unify_query', 'relation', 'knowledge', 'k8s', 'ssh'],
  locatorSources: ['service', 'pod', 'domain', 'promql', 'trace', 'business_context'],
  relationResolutionSources: ['business_context', 'pod', 'domain', 'trace'],
  validationPriority: ['query_correctness', 'symptom_truth', 'entity_resolution', 'runtime_failure', 'telemetry_collection'],
  fallback: 'request_evidence',
  conclusionSections: ['当前判断', '已确认事实', '下一步', '缺失材料'],
};
