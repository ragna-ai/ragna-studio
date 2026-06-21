interface GetSocialProfileJobData {
  userId: string;
  platform: string;
}

const GET_SOCIAL_PROFILE_JOB = 'get-social-profile-job';

class GetSocialProfileJobDto {
  userId: string;
  platform: string;

  constructor(data: GetSocialProfileJobData) {
    this.userId = data.userId;
    this.platform = data.platform;
  }

  static fromJSON(data: GetSocialProfileJobData): GetSocialProfileJobDto {
    return new GetSocialProfileJobDto({
      userId: data.userId,
      platform: data.platform,
    });
  }

  toJSON(): GetSocialProfileJobData {
    return {
      userId: this.userId,
      platform: this.platform,
    };
  }
}

export { GetSocialProfileJobDto, GET_SOCIAL_PROFILE_JOB };
