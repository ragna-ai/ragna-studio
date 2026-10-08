import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { EmailDraft, EmailDraftStatus, NewEmailDraft } from '../schema';
import { emailDraft } from '../schema';

export type {
  EmailDraft,
  EmailDraftAttachment,
  EmailDraftKind,
  EmailDraftOrigin,
  EmailDraftStatus,
  NewEmailDraft,
} from '../schema';

// A draft has reached its terminal state once discarded or sent; every list
// view that means "still being worked on" excludes these two.
const NON_TERMINAL_STATUSES: EmailDraftStatus[] = ['generating', 'ready'];

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

// Keyed lookup for the worker's Gmail reconciliation pass: it learns a
// draft's providerDraftId from drafts.list and needs the local row back to
// decide whether to upsert content or just confirm it's still there.
export async function getEmailDraftByProviderDraftId({
  providerDraftId,
  accountId,
}: {
  providerDraftId: string;
  accountId: string;
}): Promise<EmailDraft | null> {
  const found = await db.query.emailDraft.findFirst({ where: { providerDraftId, accountId } });

  return found ?? null;
}

type UpdateEmailDraftFields = Partial<
  Pick<
    NewEmailDraft,
    | 'content'
    | 'text'
    | 'quotedHtml'
    | 'quotedText'
    | 'status'
    | 'to'
    | 'cc'
    | 'bcc'
    | 'subject'
    | 'providerDraftId'
    | 'attachments'
  >
>;

// Shared by the worker (writes generated content, flips 'generating' ->
// 'ready', stores providerDraftId once pushed to Gmail) and the review UI
// (recipients/subject/body edits, discard, send).
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
// the thread view. `kind: 'new'` drafts never match this (their threadId is
// null), so they never show up here, only in listEmailDraftsByAccountId.
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

// The Drafts folder (specs/email/drafts-change-request.md, "Scope > 6"):
// every non-terminal draft for the account, newest first, whoever wrote it
// and whether or not it has a thread yet.
export async function listEmailDraftsByAccountId({
  accountId,
  statuses = NON_TERMINAL_STATUSES,
}: {
  accountId: string;
  statuses?: EmailDraftStatus[];
}): Promise<EmailDraft[]> {
  return db.query.emailDraft.findMany({
    where: { accountId, status: { in: statuses } },
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

// The sync cron's abandoned-draft sweep (specs/email/drafts-change-request.md,
// "Scope > 4"): rows that never reached Gmail (no providerDraftId to delete
// there) with no body and no recipients, left untouched past `olderThan`.
// Callers pass the result straight to deleteEmailDraft, row by row, since a
// never-pushed draft is a plain local delete.
export async function listEmptyStaleEmailDrafts({
  accountId,
  olderThan,
}: {
  accountId: string;
  olderThan: Date;
}): Promise<EmailDraft[]> {
  return db.query.emailDraft.findMany({
    where: {
      accountId,
      providerDraftId: { isNull: true },
      content: '',
      updatedAt: { lt: olderThan },
      // jsonb equality against the empty-array default; `to`/`cc`/`bcc`
      // are bound as query parameters via drizzle's sql tag, not
      // concatenated.
      RAW: (table) =>
        sql`${table.to} = '[]'::jsonb AND ${table.cc} = '[]'::jsonb AND ${table.bcc} = '[]'::jsonb`,
    },
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
