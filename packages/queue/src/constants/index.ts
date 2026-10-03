import { z } from 'zod';

export const CRON_QUEUE_NAME = '__cron__';
export const ONBOARDINGS_QUEUE = 'onboardings-queue';
export const EMAILS_QUEUE = 'emails-queue';
export const NOTIFICATIONS_QUEUE = 'notifications-queue';
export const WORKFLOWS_QUEUE = 'workflows-queue';
export const WORKFLOW_SCHEDULES_QUEUE = 'workflow-schedules-queue';
export const AGENT_CONTEXT_DOCUMENTS_QUEUE = 'agent-context-documents-queue';
export const GEN_VIDEOS_QUEUE = 'gen-videos-queue';
export const GEN_IMAGES_QUEUE = 'gen-images-queue';
export const EMAIL_SYNC_QUEUE = 'email-sync-queue';
export const EMAIL_CLASSIFY_QUEUE = 'email-classify-queue';
export const EMAIL_DRAFT_QUEUE = 'email-draft-queue';

// The set of notification kinds and the data payload each one carries. This is
// the single source of truth: adding a new notification scenario is one entry
// here plus a matching builder in the worker's notification registry. Nothing
// else in the stack (schema, API, web) needs to change.
export const notificationDataSchemas = {
  // `workflowName` is snapshotted at emit time so the presenter can interpolate
  // it without a lookup, and it reflects the name as it was when the run ran.
  workflow_run_succeeded: z.object({
    workflowId: z.uuidv7(),
    runId: z.uuidv7(),
    workflowName: z.string().trim().min(1),
    workspaceId: z.uuidv7(),
  }),
  workflow_run_failed: z.object({
    workflowId: z.uuidv7(),
    runId: z.uuidv7(),
    workflowName: z.string().trim().min(1),
    workspaceId: z.uuidv7(),
  }),
  task_reminder_due: z.object({
    taskId: z.uuidv7(),
    workspaceId: z.uuidv7(),
    taskNumber: z.number(),
    taskTitle: z.string().trim().min(1),
  }),
  // `prompt` is snapshotted at emit time so the presenter can render without
  // a lookup; truncate it for display in the presenter, not here.
  video_generation_succeeded: z.object({
    genVideoId: z.uuidv7(),
    workspaceId: z.uuidv7(),
    prompt: z.string().trim().min(1),
  }),
  video_generation_failed: z.object({
    genVideoId: z.uuidv7(),
    workspaceId: z.uuidv7(),
    prompt: z.string().trim().min(1),
  }),
  // One notification per batch (docs/imagegen/worker-execution-prd.md
  // decision 5): genImageIds carries every row the job filled in, so the
  // presenter can link straight to the library without a lookup.
  image_generation_succeeded: z.object({
    genImageIds: z.array(z.uuidv7()),
    workspaceId: z.uuidv7(),
    prompt: z.string().trim().min(1),
  }),
  image_generation_failed: z.object({
    genImageIds: z.array(z.uuidv7()),
    workspaceId: z.uuidv7(),
    prompt: z.string().trim().min(1),
  }),
} as const;

export type NotificationDataMap = {
  [T in keyof typeof notificationDataSchemas]: z.infer<(typeof notificationDataSchemas)[T]>;
};

export type NotificationType = keyof NotificationDataMap;

// The payload for a given type, or the union across all types when unspecified.
export type NotificationData<T extends NotificationType = NotificationType> = NotificationDataMap[T];
