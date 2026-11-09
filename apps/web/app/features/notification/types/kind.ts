import type { NotificationType } from '~/features/notification/types';

export type NotificationTone = 'neutral' | 'danger' | 'warn';

export interface NotificationKind {
  icon: string;
  tone: NotificationTone;
}

export const NOTIFICATION_KINDS: Record<NotificationType, NotificationKind> = {
  workflow_run_succeeded: { icon: 'flow-connection', tone: 'neutral' },
  workflow_run_failed: { icon: 'flow-connection', tone: 'danger' },
  task_reminder_due: { icon: 'check-list', tone: 'neutral' },
  image_generation_succeeded: { icon: 'image-01', tone: 'neutral' },
  image_generation_failed: { icon: 'image-01', tone: 'danger' },
  video_generation_succeeded: { icon: 'video-replay', tone: 'neutral' },
  video_generation_failed: { icon: 'video-replay', tone: 'danger' },
  integration_needs_reauth: { icon: 'unplug', tone: 'warn' },
};

export const FALLBACK_NOTIFICATION_KIND: NotificationKind = {
  icon: 'notification-01',
  tone: 'neutral',
};

export const NOTIFICATION_TONE_CLASS: Record<NotificationTone, string> = {
  neutral: 'bg-chip text-icon',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  warn: 'bg-status-warn-bg text-status-warn-fg',
};

export function getNotificationKind(type: string): NotificationKind {
  return Object.hasOwn(NOTIFICATION_KINDS, type)
    ? NOTIFICATION_KINDS[type as NotificationType]
    : FALLBACK_NOTIFICATION_KIND;
}
