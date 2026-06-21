interface OnboardUserJobData {
  userId: string;
}

const ONBOARD_USER_JOB = 'onboard-user-job';

class OnboardUserJobDto {
  userId: string;

  constructor(data: OnboardUserJobData) {
    this.userId = data.userId;
  }

  static fromJSON(data: OnboardUserJobData): OnboardUserJobDto {
    return new OnboardUserJobDto({
      userId: data.userId,
    });
  }

  toJSON(): OnboardUserJobData {
    return {
      userId: this.userId,
    };
  }
}

export { OnboardUserJobDto, ONBOARD_USER_JOB };
