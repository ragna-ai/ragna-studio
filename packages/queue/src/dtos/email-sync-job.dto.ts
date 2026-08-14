// Cron fans out one job per connected account (docs/email/prd.md, "Worker
// jobs"). The job reads the account's stored syncCursor off the DB rather
// than carrying it in the payload, same reasoning as gen-images-job.dto.ts's
// id-list payload.
interface EmailSyncJobData {
  accountId: string;
}

const EMAIL_SYNC_JOB = 'email-sync-job';

class EmailSyncJobDto {
  accountId: string;

  constructor(data: EmailSyncJobData) {
    this.accountId = data.accountId;
  }

  static fromJSON(data: EmailSyncJobData): EmailSyncJobDto {
    return new EmailSyncJobDto({
      accountId: data.accountId,
    });
  }

  toJSON(): EmailSyncJobData {
    return {
      accountId: this.accountId,
    };
  }
}

export { EMAIL_SYNC_JOB, EmailSyncJobDto };
export type { EmailSyncJobData };
