import type { NotificationData, NotificationType } from '../constants';
import { NOTIFY_USER_JOB, NotifyUserJobDto } from '../dtos';
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
  return queue
    .notification()
    .add(NOTIFY_USER_JOB, new NotifyUserJobDto({ userId, type, data }).toJSON());
}
