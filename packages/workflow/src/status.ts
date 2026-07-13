export const WORKFLOW_RUN_STATUSES = [
  'pending',
  'running',
  'suspended',
  'completed',
  'failed',
] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export const WORKFLOW_STEP_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
] as const;
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];
