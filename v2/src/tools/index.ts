export const plannedToolClasses = ['unify_query', 'relation', 'knowledge', 'k8s', 'ssh'] as const;

export type PlannedToolClass = (typeof plannedToolClasses)[number];
