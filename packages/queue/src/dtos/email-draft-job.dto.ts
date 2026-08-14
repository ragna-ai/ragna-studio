// Enqueued by email-classify (auto-draft) or the manual "Draft with AI"
// endpoint (docs/email/prd.md, "Worker jobs"). `agentId` overrides the
// account's default agent for manual triggers; omitted for the auto path.
interface EmailDraftJobData {
  accountId: string;
  threadId: string;
  replyToMessageId: string;
  agentId?: string;
}

const EMAIL_DRAFT_JOB = 'email-draft-job';

class EmailDraftJobDto {
  accountId: string;
  threadId: string;
  replyToMessageId: string;
  agentId?: string;

  constructor(data: EmailDraftJobData) {
    this.accountId = data.accountId;
    this.threadId = data.threadId;
    this.replyToMessageId = data.replyToMessageId;
    this.agentId = data.agentId;
  }

  static fromJSON(data: EmailDraftJobData): EmailDraftJobDto {
    return new EmailDraftJobDto({
      accountId: data.accountId,
      threadId: data.threadId,
      replyToMessageId: data.replyToMessageId,
      agentId: data.agentId,
    });
  }

  toJSON(): EmailDraftJobData {
    return {
      accountId: this.accountId,
      threadId: this.threadId,
      replyToMessageId: this.replyToMessageId,
      agentId: this.agentId,
    };
  }
}

export { EMAIL_DRAFT_JOB, EmailDraftJobDto };
export type { EmailDraftJobData };
