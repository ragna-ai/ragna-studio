import type { NotificationData, NotificationType } from '../constants';

// Generic over the notification type so `type` and `data` are checked as a
// pair: emitting `workflow_run_failed` with the wrong payload is a type error.
interface NotifyUserJobData<T extends NotificationType = NotificationType> {
  userId: string;
  type: T;
  data: NotificationData<T>;
}

const NOTIFY_USER_JOB = 'notify-user-job';

class NotifyUserJobDto<T extends NotificationType = NotificationType> {
  userId: string;
  type: T;
  data: NotificationData<T>;

  constructor(data: NotifyUserJobData<T>) {
    this.userId = data.userId;
    this.type = data.type;
    this.data = data.data;
  }

  static fromJSON(data: unknown): NotifyUserJobDto {
    return new NotifyUserJobDto(data as NotifyUserJobData);
  }

  toJSON(): NotifyUserJobData<T> {
    return {
      userId: this.userId,
      type: this.type,
      data: this.data,
    };
  }
}

export { NOTIFY_USER_JOB, NotifyUserJobDto };
