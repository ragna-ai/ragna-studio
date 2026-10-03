import type { NotificationData, NotificationType } from '../constants';
import { NOTIFY_USER_JOB, parseNotifyUserJob } from '../dtos';
import { queue } from '../queues';

export function enqueueNotification<T extends NotificationType>({
  userId,
  type,
  data,
}: {
  userId: string;
  type: T;
  data: NotificationData<T>;
}) {
  return queue.notification().add(NOTIFY_USER_JOB, parseNotifyUserJob({ userId, type, data }));
}
