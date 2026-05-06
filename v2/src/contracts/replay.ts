import type {
  BlockerCode,
  EvidenceType,
  InvestigationMode,
  RuntimeResult,
  ToolClass,
  TurnInput,
} from './runtime';

export interface ReplayCaseSource {
  origin: 'v1' | 'v2';
  legacy_case_id?: string;
  legacy_suite_version?: string;
  category?: string;
  subcategory?: string;
}

export interface ReplayBlockerContract {
  expect_present?: boolean;
  expected_code?: BlockerCode;
  allowed_codes?: BlockerCode[];
  forbidden_codes?: BlockerCode[];
  expected_retryable?: boolean;
  expected_tool_name?: string;
  missing_any?: string[];
  missing_all?: string[];
}

export interface ReplayConclusionContract {
  summary_must_contain_keywords?: string[];
  next_actions_must_contain_keywords?: string[];
  hypotheses_must_contain_keywords?: string[];
  confirmed_facts_must_contain_keywords?: string[];
  missing_evidence_any?: string[];
  missing_evidence_all?: string[];
}

export interface ReplayToolExecutionContract {
  min_calls?: number;
  max_calls?: number;
  expected_adapter?: string;
  required_tool_names?: string[];
  required_blocker_codes?: BlockerCode[];
  must_have_success?: boolean;
  must_have_failure?: boolean;
  require_duration_ms?: boolean;
}

export interface ReplayCase {
  id: string;
  title: string;
  input: TurnInput;
  intent_contract?: {
    expected_mode?: InvestigationMode;
    must_not_mode?: InvestigationMode[];
  };
  trajectory_contract?: {
    preferred_first_tool_classes?: ToolClass[];
    forbidden_first_tool_classes?: ToolClass[];
  };
  evidence_contract?: {
    must_have_any?: EvidenceType[];
    must_have_all?: EvidenceType[];
    must_not_be_knowledge_only?: boolean;
  };
  blocker_contract?: ReplayBlockerContract;
  conclusion_contract?: ReplayConclusionContract;
  tool_execution_contract?: ReplayToolExecutionContract;
  response_contract?: {
    semantic_criteria?: string[];
    must_include_sections?: string[];
    must_contain_keywords?: string[];
    must_contain_any_groups?: string[][];
    must_not_contain_keywords?: string[];
    must_not_be_generic_manual?: boolean;
    max_reply_length?: number;
  };
  source?: ReplayCaseSource;
  notes?: string;
}

export interface JudgeCheck {
  layer: 'intent' | 'trajectory' | 'evidence' | 'blocker' | 'conclusion' | 'tool_execution' | 'response';
  name: string;
  pass: boolean;
  detail: string;
}

export interface JudgeResult {
  id: string;
  title: string;
  status: 'PASS' | 'FAIL';
  passed: number;
  total: number;
  checks: JudgeCheck[];
  runtime: RuntimeResult;
}

export interface ReplayCaseReport {
  id: string;
  title: string;
  status: 'PASS' | 'FAIL';
  passed: number;
  total: number;
  checks: JudgeCheck[];
  runtime: RuntimeResult;
  replySnippet: string;
  source?: ReplayCaseSource;
}

export interface ReplayRunReport {
  summary: 'PASS' | 'FAILED';
  timestamp: string;
  casesFile: string;
  total: number;
  passed: number;
  failed: number;
  cases: ReplayCaseReport[];
}

export interface ReplaySuite {
  version: string;
  description?: string;
  cases: ReplayCase[];
}
