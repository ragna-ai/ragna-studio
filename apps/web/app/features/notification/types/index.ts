// Mirrors @repo/queue's NotificationDataMap. Kept as a local copy so the web
// bundle never imports the server queue package (bullmq/redis). Adding a kind
// means adding an entry here and a matching presenter.
export interface NotificationDataMap {
  workflow_run_succeeded: {
    workflowId: string;
    runId: string;
    workflowName: string;
    workspaceId: string;
  };
  workflow_run_failed: {
    workflowId: string;
    runId: string;
    workflowName: string;
    workspaceId: string;
  };
  task_reminder_due: {
    taskId: string;
    workspaceId: string;
    taskNumber: number;
    taskTitle: string;
  };
  // `prompt` is snapshotted at emit time so the presenter can render without
  // a lookup; truncated for display in the presenter, not here.
  video_generation_succeeded: {
    genVideoId: string;
    workspaceId: string;
    prompt: string;
  };
  video_generation_failed: {
    genVideoId: string;
    workspaceId: string;
    prompt: string;
  };
}

export type NotificationType = keyof NotificationDataMap;

export interface Notification {
  id: string;
  userId: string;
  type: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationManyResponse {
  notifications: Notification[];
  count: number;
}

export interface NotificationResponse {
  notification: Notification;
}

export interface NotificationUnreadResponse {
  count: number;
}
