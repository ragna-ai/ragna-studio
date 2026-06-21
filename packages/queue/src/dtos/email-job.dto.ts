interface VerifyEmailJobData {
  email: string;
  url: string;
}

const VERIFY_EMAIL_JOB = 'send-verification-email-job';

class VerifyEmailJobDto {
  email: string;
  url: string;

  constructor(data: VerifyEmailJobData) {
    this.email = data.email;
    this.url = data.url;
  }

  static fromJSON(data: VerifyEmailJobData): VerifyEmailJobDto {
    return new VerifyEmailJobDto({
      email: data.email,
      url: data.url,
    });
  }

  toJSON(): VerifyEmailJobData {
    return {
      email: this.email,
      url: this.url,
    };
  }
}

const WELCOME_EMAIL_JOB = 'send-welcome-email-job';

class WelcomeEmailJobDto {
  email: string;
  name: string;

  constructor(data: { email: string; name: string }) {
    this.email = data.email;
    this.name = data.name;
  }

  static fromJSON(data: { email: string; name: string }): WelcomeEmailJobDto {
    return new WelcomeEmailJobDto({
      email: data.email,
      name: data.name,
    });
  }

  toJSON(): { email: string; name: string } {
    return {
      email: this.email,
      name: this.name,
    };
  }
}

export { WelcomeEmailJobDto, WELCOME_EMAIL_JOB };
export { VerifyEmailJobDto, VERIFY_EMAIL_JOB };
