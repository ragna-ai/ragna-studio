export const CRON_QUEUE_NAME = '__cron__';
export const ONBOARDINGS_QUEUE = 'onboardings-queue';
export const EMAILS_QUEUE = 'emails-queue';
export const NOTIFICATIONS_QUEUE = 'notifications-queue';
export const WORKFLOWS_QUEUE = 'workflows-queue';
export const WORKFLOW_SCHEDULES_QUEUE = 'workflow-schedules-queue';
export const AGENT_CONTEXT_DOCUMENTS_QUEUE = 'agent-context-documents-queue';

// The set of notification kinds and the data payload each one carries. This is
// the single source of truth: adding a new notification scenario is one entry
// here plus a matching builder in the worker's notification registry. Nothing
// else in the stack (schema, API, web) needs to change.
export interface NotificationDataMap {
  // `workflowName` is snapshotted at emit time so the presenter can interpolate
  // it without a lookup, and it reflects the name as it was when the run ran.
  workflow_run_succeeded: { workflowId: string; runId: string; workflowName: string };
  workflow_run_failed: { workflowId: string; runId: string; workflowName: string };
}

export type NotificationType = keyof NotificationDataMap;

// The payload for a given type, or the union across all types when unspecified.
export type NotificationData<T extends NotificationType = NotificationType> = NotificationDataMap[T];
