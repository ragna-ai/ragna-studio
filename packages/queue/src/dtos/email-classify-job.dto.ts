// Enqueued by email-sync for every new message (docs/email/prd.md, "Worker
// jobs"): fetches the body, persists it, classifies with the account's
// category set, and enqueues email-draft when auto-draft applies.
interface EmailClassifyJobData {
  accountId: string;
  messageId: string;
}

const EMAIL_CLASSIFY_JOB = 'email-classify-job';

class EmailClassifyJobDto {
  accountId: string;
  messageId: string;

  constructor(data: EmailClassifyJobData) {
    this.accountId = data.accountId;
    this.messageId = data.messageId;
  }

  static fromJSON(data: EmailClassifyJobData): EmailClassifyJobDto {
    return new EmailClassifyJobDto({
      accountId: data.accountId,
      messageId: data.messageId,
    });
  }

  toJSON(): EmailClassifyJobData {
    return {
      accountId: this.accountId,
      messageId: this.messageId,
    };
  }
}

export { EMAIL_CLASSIFY_JOB, EmailClassifyJobDto };
export type { EmailClassifyJobData };
