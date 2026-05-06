import type { JudgeCheck, JudgeResult, ReplayCase, RuntimeResult, ToolClass } from '../../src/contracts';

function firstToolClass(runtime: RuntimeResult): ToolClass | undefined {
  return runtime.plan.find((step) => step.kind === 'invoke_tool')?.toolClass;
}

function pushCheck(checks: JudgeCheck[], check: JudgeCheck): void {
  checks.push(check);
}

function looksLikeGenericManual(reply: string): { isManual: boolean; hits: string[] } {
  const manualSignals = ['第一步', '第二步', '第三步', '排查步骤：', '排查清单', '常见原因包括'];
  const hits = manualSignals.filter((signal) => reply.includes(signal));
  return {
    isManual: hits.length >= 2 && reply.length > 600,
    hits,
  };
}

function listIncludesKeyword(items: string[], keyword: string): boolean {
  return items.some((item) => item.includes(keyword));
}

export function judgeReplayCase(replayCase: ReplayCase, runtime: RuntimeResult): JudgeResult {
  const checks: JudgeCheck[] = [];
  const firstPlannedTool = firstToolClass(runtime);
  const evidenceTypes = new Set(runtime.evidence.map((item) => item.type));
  const blockerMissing = runtime.blocker?.missing ?? [];
  const conclusion = runtime.conclusion;
  const conclusionNextActions = conclusion.nextActions ?? [];
  const conclusionHypotheses = conclusion.hypotheses ?? [];
  const conclusionConfirmedFacts = conclusion.confirmedFacts ?? [];
  const conclusionMissingEvidence = conclusion.missingEvidence ?? [];
  const toolExecutions = runtime.toolExecutions ?? [];
  const executionToolNames = toolExecutions.map((item) => item.toolName);
  const executionBlockerCodes = toolExecutions
    .map((item) => item.blockerCode)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (replayCase.intent_contract?.expected_mode) {
    pushCheck(checks, {
      layer: 'intent',
      name: 'expected_mode',
      pass: runtime.mode === replayCase.intent_contract.expected_mode,
      detail: `expected=${replayCase.intent_contract.expected_mode}, actual=${runtime.mode}`,
    });
  }

  for (const mode of replayCase.intent_contract?.must_not_mode ?? []) {
    pushCheck(checks, {
      layer: 'intent',
      name: `must_not_mode:${mode}`,
      pass: runtime.mode !== mode,
      detail: `forbidden=${mode}, actual=${runtime.mode}`,
    });
  }

  const preferred = replayCase.trajectory_contract?.preferred_first_tool_classes ?? [];
  if (preferred.length > 0) {
    pushCheck(checks, {
      layer: 'trajectory',
      name: 'preferred_first_tool_classes',
      pass: !!firstPlannedTool && preferred.includes(firstPlannedTool),
      detail: `preferred=[${preferred.join(', ')}], actual=${firstPlannedTool ?? 'none'}`,
    });
  }

  for (const toolClass of replayCase.trajectory_contract?.forbidden_first_tool_classes ?? []) {
    pushCheck(checks, {
      layer: 'trajectory',
      name: `forbidden_first_tool:${toolClass}`,
      pass: firstPlannedTool !== toolClass,
      detail: `forbidden=${toolClass}, actual=${firstPlannedTool ?? 'none'}`,
    });
  }

  const mustHaveAny = replayCase.evidence_contract?.must_have_any ?? [];
  if (mustHaveAny.length > 0) {
    pushCheck(checks, {
      layer: 'evidence',
      name: 'must_have_any',
      pass: mustHaveAny.some((item) => evidenceTypes.has(item)),
      detail: `expected-any=[${mustHaveAny.join(', ')}], actual=[${[...evidenceTypes].join(', ')}]`,
    });
  }

  for (const evidenceType of replayCase.evidence_contract?.must_have_all ?? []) {
    pushCheck(checks, {
      layer: 'evidence',
      name: `must_have_all:${evidenceType}`,
      pass: evidenceTypes.has(evidenceType),
      detail: `actual=[${[...evidenceTypes].join(', ')}]`,
    });
  }

  if (replayCase.evidence_contract?.must_not_be_knowledge_only) {
    pushCheck(checks, {
      layer: 'evidence',
      name: 'must_not_be_knowledge_only',
      pass: runtime.selectedToolClasses.some((item) => item !== 'knowledge') || evidenceTypes.size > 0,
      detail: `selected=[${runtime.selectedToolClasses.join(', ')}], evidence=[${[...evidenceTypes].join(', ')}]`,
    });
  }

  if (replayCase.blocker_contract?.expect_present !== undefined) {
    pushCheck(checks, {
      layer: 'blocker',
      name: 'expect_present',
      pass: replayCase.blocker_contract.expect_present ? Boolean(runtime.blocker) : !runtime.blocker,
      detail: `expected=${replayCase.blocker_contract.expect_present}, actual=${Boolean(runtime.blocker)}`,
    });
  }

  if (replayCase.blocker_contract?.expected_code) {
    pushCheck(checks, {
      layer: 'blocker',
      name: 'expected_code',
      pass: runtime.blocker?.code === replayCase.blocker_contract.expected_code,
      detail: `expected=${replayCase.blocker_contract.expected_code}, actual=${runtime.blocker?.code ?? 'absent'}`,
    });
  }

  const allowedCodes = replayCase.blocker_contract?.allowed_codes ?? [];
  if (allowedCodes.length > 0) {
    pushCheck(checks, {
      layer: 'blocker',
      name: 'allowed_codes',
      pass: !!runtime.blocker?.code && allowedCodes.includes(runtime.blocker.code),
      detail: `allowed=[${allowedCodes.join(', ')}], actual=${runtime.blocker?.code ?? 'absent'}`,
    });
  }

  for (const code of replayCase.blocker_contract?.forbidden_codes ?? []) {
    pushCheck(checks, {
      layer: 'blocker',
      name: `forbidden_code:${code}`,
      pass: runtime.blocker?.code !== code,
      detail: `forbidden=${code}, actual=${runtime.blocker?.code ?? 'absent'}`,
    });
  }

  if (replayCase.blocker_contract?.expected_retryable !== undefined) {
    pushCheck(checks, {
      layer: 'blocker',
      name: 'expected_retryable',
      pass: runtime.blocker?.retryable === replayCase.blocker_contract.expected_retryable,
      detail: `expected=${replayCase.blocker_contract.expected_retryable}, actual=${runtime.blocker?.retryable ?? 'absent'}`,
    });
  }

  if (replayCase.blocker_contract?.expected_tool_name) {
    pushCheck(checks, {
      layer: 'blocker',
      name: 'expected_tool_name',
      pass: runtime.blocker?.toolName === replayCase.blocker_contract.expected_tool_name,
      detail: `expected=${replayCase.blocker_contract.expected_tool_name}, actual=${runtime.blocker?.toolName ?? 'absent'}`,
    });
  }

  const blockerMissingAny = replayCase.blocker_contract?.missing_any ?? [];
  if (blockerMissingAny.length > 0) {
    pushCheck(checks, {
      layer: 'blocker',
      name: 'missing_any',
      pass: blockerMissingAny.some((item) => blockerMissing.includes(item)),
      detail: `expected-any=[${blockerMissingAny.join(', ')}], actual=[${blockerMissing.join(', ')}]`,
    });
  }

  for (const missing of replayCase.blocker_contract?.missing_all ?? []) {
    pushCheck(checks, {
      layer: 'blocker',
      name: `missing_all:${missing}`,
      pass: blockerMissing.includes(missing),
      detail: `actual=[${blockerMissing.join(', ')}]`,
    });
  }

  for (const keyword of replayCase.conclusion_contract?.summary_must_contain_keywords ?? []) {
    pushCheck(checks, {
      layer: 'conclusion',
      name: `summary_must_contain:${keyword}`,
      pass: conclusion.summary.includes(keyword),
      detail: conclusion.summary.includes(keyword) ? 'found' : `missing in summary=${conclusion.summary}`,
    });
  }

  for (const keyword of replayCase.conclusion_contract?.next_actions_must_contain_keywords ?? []) {
    const pass = listIncludesKeyword(conclusionNextActions, keyword);
    pushCheck(checks, {
      layer: 'conclusion',
      name: `next_actions_must_contain:${keyword}`,
      pass,
      detail: pass ? `found in [${conclusionNextActions.join(' | ')}]` : `missing in [${conclusionNextActions.join(' | ')}]`,
    });
  }

  for (const keyword of replayCase.conclusion_contract?.hypotheses_must_contain_keywords ?? []) {
    const pass = listIncludesKeyword(conclusionHypotheses, keyword);
    pushCheck(checks, {
      layer: 'conclusion',
      name: `hypotheses_must_contain:${keyword}`,
      pass,
      detail: pass ? `found in [${conclusionHypotheses.join(' | ')}]` : `missing in [${conclusionHypotheses.join(' | ')}]`,
    });
  }

  for (const keyword of replayCase.conclusion_contract?.confirmed_facts_must_contain_keywords ?? []) {
    const pass = listIncludesKeyword(conclusionConfirmedFacts, keyword);
    pushCheck(checks, {
      layer: 'conclusion',
      name: `confirmed_facts_must_contain:${keyword}`,
      pass,
      detail: pass ? `found in [${conclusionConfirmedFacts.join(' | ')}]` : `missing in [${conclusionConfirmedFacts.join(' | ')}]`,
    });
  }

  const missingEvidenceAny = replayCase.conclusion_contract?.missing_evidence_any ?? [];
  if (missingEvidenceAny.length > 0) {
    pushCheck(checks, {
      layer: 'conclusion',
      name: 'missing_evidence_any',
      pass: missingEvidenceAny.some((item) => conclusionMissingEvidence.includes(item)),
      detail: `expected-any=[${missingEvidenceAny.join(', ')}], actual=[${conclusionMissingEvidence.join(', ')}]`,
    });
  }

  for (const missing of replayCase.conclusion_contract?.missing_evidence_all ?? []) {
    pushCheck(checks, {
      layer: 'conclusion',
      name: `missing_evidence_all:${missing}`,
      pass: conclusionMissingEvidence.includes(missing),
      detail: `actual=[${conclusionMissingEvidence.join(', ')}]`,
    });
  }

  if (replayCase.tool_execution_contract?.min_calls !== undefined) {
    pushCheck(checks, {
      layer: 'tool_execution',
      name: 'min_calls',
      pass: toolExecutions.length >= replayCase.tool_execution_contract.min_calls,
      detail: `expected>=${replayCase.tool_execution_contract.min_calls}, actual=${toolExecutions.length}`,
    });
  }

  if (replayCase.tool_execution_contract?.max_calls !== undefined) {
    pushCheck(checks, {
      layer: 'tool_execution',
      name: 'max_calls',
      pass: toolExecutions.length <= replayCase.tool_execution_contract.max_calls,
      detail: `expected<=${replayCase.tool_execution_contract.max_calls}, actual=${toolExecutions.length}`,
    });
  }

  if (replayCase.tool_execution_contract?.expected_adapter) {
    pushCheck(checks, {
      layer: 'tool_execution',
      name: 'expected_adapter',
      pass: runtime.adapterName === replayCase.tool_execution_contract.expected_adapter,
      detail: `expected=${replayCase.tool_execution_contract.expected_adapter}, actual=${runtime.adapterName ?? 'absent'}`,
    });
  }

  for (const toolName of replayCase.tool_execution_contract?.required_tool_names ?? []) {
    pushCheck(checks, {
      layer: 'tool_execution',
      name: `required_tool_name:${toolName}`,
      pass: executionToolNames.includes(toolName),
      detail: `actual=[${executionToolNames.join(', ')}]`,
    });
  }

  for (const code of replayCase.tool_execution_contract?.required_blocker_codes ?? []) {
    pushCheck(checks, {
      layer: 'tool_execution',
      name: `required_blocker_code:${code}`,
      pass: executionBlockerCodes.includes(code),
      detail: `actual=[${executionBlockerCodes.join(', ')}]`,
    });
  }

  if (replayCase.tool_execution_contract?.must_have_success !== undefined) {
    const hasSuccess = toolExecutions.some((item) => item.success);
    pushCheck(checks, {
      layer: 'tool_execution',
      name: 'must_have_success',
      pass: replayCase.tool_execution_contract.must_have_success ? hasSuccess : !hasSuccess,
      detail: `expected=${replayCase.tool_execution_contract.must_have_success}, actual=${hasSuccess}`,
    });
  }

  if (replayCase.tool_execution_contract?.must_have_failure !== undefined) {
    const hasFailure = toolExecutions.some((item) => !item.success);
    pushCheck(checks, {
      layer: 'tool_execution',
      name: 'must_have_failure',
      pass: replayCase.tool_execution_contract.must_have_failure ? hasFailure : !hasFailure,
      detail: `expected=${replayCase.tool_execution_contract.must_have_failure}, actual=${hasFailure}`,
    });
  }

  if (replayCase.tool_execution_contract?.require_duration_ms) {
    const pass = toolExecutions.length > 0 && toolExecutions.every((item) => typeof item.durationMs === 'number');
    pushCheck(checks, {
      layer: 'tool_execution',
      name: 'require_duration_ms',
      pass,
      detail: pass
        ? `all tool executions expose durationMs (${toolExecutions.length})`
        : `missing durationMs in executions=[${toolExecutions.map((item) => `${item.toolName}:${String(item.durationMs)}`).join(', ')}]`,
    });
  }

  const reply = runtime.conclusion.reply;
  for (const section of replayCase.response_contract?.must_include_sections ?? []) {
    pushCheck(checks, {
      layer: 'response',
      name: `must_include_section:${section}`,
      pass: reply.includes(section),
      detail: reply.includes(section) ? 'found' : 'missing',
    });
  }

  for (const keyword of replayCase.response_contract?.must_contain_keywords ?? []) {
    pushCheck(checks, {
      layer: 'response',
      name: `must_contain_keyword:${keyword}`,
      pass: reply.includes(keyword),
      detail: reply.includes(keyword) ? 'found' : 'missing',
    });
  }

  for (const group of replayCase.response_contract?.must_contain_any_groups ?? []) {
    const hits = group.filter((keyword) => reply.includes(keyword));
    pushCheck(checks, {
      layer: 'response',
      name: `must_contain_any:[${group.join('|')}]`,
      pass: hits.length > 0,
      detail: hits.length > 0 ? `found=${hits.join(', ')}` : 'none matched',
    });
  }

  for (const keyword of replayCase.response_contract?.must_not_contain_keywords ?? []) {
    const hit = reply.includes(keyword);
    pushCheck(checks, {
      layer: 'response',
      name: `must_not_contain_keyword:${keyword}`,
      pass: !hit,
      detail: hit ? 'found (bad)' : 'absent (good)',
    });
  }

  if (replayCase.response_contract?.must_not_be_generic_manual) {
    const manual = looksLikeGenericManual(reply);
    pushCheck(checks, {
      layer: 'response',
      name: 'must_not_be_generic_manual',
      pass: !manual.isManual,
      detail: manual.isManual ? `signals=${manual.hits.join(', ')}, length=${reply.length}` : 'ok',
    });
  }

  if (replayCase.response_contract?.max_reply_length) {
    pushCheck(checks, {
      layer: 'response',
      name: 'max_reply_length',
      pass: reply.length <= replayCase.response_contract.max_reply_length,
      detail: `length=${reply.length}, max=${replayCase.response_contract.max_reply_length}`,
    });
  }

  const passed = checks.filter((item) => item.pass).length;
  const total = checks.length;
  return {
    id: replayCase.id,
    title: replayCase.title,
    status: passed === total ? 'PASS' : 'FAIL',
    passed,
    total,
    checks,
    runtime,
  };
}
