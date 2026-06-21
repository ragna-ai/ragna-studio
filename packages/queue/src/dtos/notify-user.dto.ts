interface NotifyUserJobData {
  userId: string;
  message: string;
}

const NOTIFY_USER_JOB = 'notify-user-job';

class NotifyUserJobDto {
  userId: string;
  message: string;

  constructor(data: NotifyUserJobData) {
    this.userId = data.userId;
    this.message = data.message;
  }

  static fromJSON(data: NotifyUserJobData): NotifyUserJobDto {
    return new NotifyUserJobDto({
      userId: data.userId,
      message: data.message,
    });
  }

  toJSON(): NotifyUserJobData {
    return {
      userId: this.userId,
      message: this.message,
    };
  }
}

export { NotifyUserJobDto, NOTIFY_USER_JOB };
