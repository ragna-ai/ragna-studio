import { z } from 'zod';
import type { NotificationData, NotificationType } from '../constants';
import { notificationDataSchemas } from '../constants';

// Generic over the notification type so `type` and `data` are checked as a
// pair: emitting `workflow_run_failed` with the wrong payload is a type error.
export interface NotifyUserJobData<T extends NotificationType = NotificationType> {
  userId: string;
  type: T;
  data: NotificationData<T>;
}

const notifyUserEnvelopeSchema = z.object({
  userId: z.uuidv7(),
  // z.enum needs a non-empty tuple; Object.keys only yields string[].
  type: z.enum(Object.keys(notificationDataSchemas) as [NotificationType, ...NotificationType[]]),
  data: z.unknown(),
});

export const NOTIFY_USER_JOB = 'notify-user-job';

/** Validates the envelope, then the `data` payload against the schema for its `type`. */
export function parseNotifyUserJob(input: unknown): NotifyUserJobData {
  const { userId, type, data } = notifyUserEnvelopeSchema.parse(input);
  return { userId, type, data: notificationDataSchemas[type].parse(data) };
}
