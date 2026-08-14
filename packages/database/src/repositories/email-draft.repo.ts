import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { EmailDraft, EmailDraftStatus, NewEmailDraft } from '../schema';
import { emailDraft } from '../schema';

export type { EmailDraft, EmailDraftStatus, NewEmailDraft } from '../schema';

export async function createEmailDraft(values: NewEmailDraft): Promise<EmailDraft> {
  const [created] = await db.insert(emailDraft).values(values).returning();

  if (!created) {
    throw new Error('Failed to create email draft');
  }

  return created;
}

export async function getEmailDraftById({
  id,
  accountId,
}: {
  id: string;
  accountId: string;
}): Promise<EmailDraft | null> {
  const found = await db.query.emailDraft.findFirst({ where: { id, accountId } });

  return found ?? null;
}

type UpdateEmailDraftFields = Partial<Pick<NewEmailDraft, 'content' | 'status'>>;

// Shared by the worker (writes generated content, flips 'generating' ->
// 'ready') and the review UI (user edits, discard, send).
export async function updateEmailDraft({
  id,
  accountId,
  ...fields
}: { id: string; accountId: string } & UpdateEmailDraftFields): Promise<EmailDraft | null> {
  const [updated] = await db
    .update(emailDraft)
    .set(fields)
    .where(and(eq(emailDraft.id, id), eq(emailDraft.accountId, accountId)))
    .returning();

  return updated ?? null;
}

// Every draft on a thread (newest first), for the inline draft panel next to
// the thread view.
export async function listEmailDraftsByThreadId({
  threadId,
  accountId,
}: {
  threadId: string;
  accountId: string;
}): Promise<EmailDraft[]> {
  return db.query.emailDraft.findMany({
    where: { threadId, accountId },
    orderBy: (t, { desc }) => desc(t.createdAt),
  });
}

// Drafts awaiting attention across the account: 'generating' by default (a
// status poll from the review UI while a draft job is still running), or
// whatever `statuses` the caller passes — e.g. the review inbox also wants
// 'ready' drafts, not just in-flight ones.
export async function listPendingEmailDraftsByAccountId({
  accountId,
  statuses = ['generating'],
}: {
  accountId: string;
  statuses?: EmailDraftStatus[];
}): Promise<EmailDraft[]> {
  return db.query.emailDraft.findMany({
    where: { accountId, status: { in: statuses } },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

export async function deleteEmailDraft({
  id,
  accountId,
}: {
  id: string;
  accountId: string;
}): Promise<void> {
  await db.delete(emailDraft).where(and(eq(emailDraft.id, id), eq(emailDraft.accountId, accountId)));
}
