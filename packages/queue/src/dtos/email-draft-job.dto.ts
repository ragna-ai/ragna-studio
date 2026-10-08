import { z } from 'zod';

// Enqueued by email-classify (auto-draft) or the manual "Draft with AI"
// endpoint. `agentId` overrides the
// account's default agent for manual triggers; omitted for the auto path.
export const emailDraftJobSchema = z.object({
  accountId: z.uuidv7(),
  threadId: z.uuidv7(),
  replyToMessageId: z.uuidv7(),
  agentId: z.uuidv7().optional(),
});

export type EmailDraftJobData = z.infer<typeof emailDraftJobSchema>;

export const EMAIL_DRAFT_JOB = 'email-draft-job';
