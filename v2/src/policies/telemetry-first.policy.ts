import type { ToolClass, TurnModel } from '../contracts';

function append(classes: ToolClass[], toolClass: ToolClass): void {
  if (!classes.includes(toolClass)) {
    classes.push(toolClass);
  }
}

export function chooseInitialToolClasses(model: TurnModel): ToolClass[] {
  const classes: ToolClass[] = [];

  if (model.relationIntent && model.explicitPod && !model.hasTraceId) {
    append(classes, 'relation');
    append(classes, 'unify_query');
    if (model.startupOrConfigFailure) {
      append(classes, 'knowledge');
    }
    return classes;
  }

  if (model.validationFocus === 'query_correctness' || model.validationFocus === 'symptom_truth') {
    append(classes, 'unify_query');
    if (model.targetResolutionSource === 'business_context' || model.explicitPod || model.explicitDomain || model.relationIntent) {
      append(classes, 'relation');
    }
    if (model.startupOrConfigFailure) {
      append(classes, 'knowledge');
    }
    return classes;
  }

  if (model.hasTraceId) {
    append(classes, 'unify_query');
    if (model.relationIntent) {
      append(classes, 'relation');
    }
    return classes;
  }

  if (model.targetResolutionSource === 'business_context') {
    append(classes, 'relation');
    append(classes, 'unify_query');
    if (model.startupOrConfigFailure) {
      append(classes, 'knowledge');
    }
    return classes;
  }

  if (model.explicitService || model.explicitPod || model.explicitDomain || model.businessHint) {
    append(classes, 'unify_query');
  }

  if (model.explicitPod || model.explicitDomain || (model.relationIntent && (model.explicitService || model.businessHint))) {
    append(classes, 'relation');
  }

  if (model.startupOrConfigFailure) {
    append(classes, 'knowledge');
  }

  return classes;
}
