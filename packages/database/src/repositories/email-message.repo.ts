import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import type { EmailMessage, EmailMessageBody, NewEmailMessage } from '../schema';
import { emailMessage } from '../schema';

export type { EmailMessage, EmailMessageFolder, NewEmailMessage } from '../schema';

export type EmailMessageWithBody = EmailMessage & { body: EmailMessageBody | null };

// Upserts on (accountId, providerMessageId). categoryId is left out of the
// conflict `set`: it's owned by setEmailMessageCategory (the classifier),
// and a re-sync of the same message (e.g. a label change) must never clobber
// an existing classification back to null.
export async function upsertEmailMessageByProviderMessageId(
  values: NewEmailMessage,
): Promise<EmailMessage> {
  const [upserted] = await db
    .insert(emailMessage)
    .values(values)
    .onConflictDoUpdate({
      target: [emailMessage.accountId, emailMessage.providerMessageId],
      set: {
        threadId: values.threadId,
        from: values.from,
        to: values.to,
        cc: values.cc,
        subject: values.subject,
        snippet: values.snippet,
        sentAt: values.sentAt,
        isUnread: values.isUnread,
        isStarred: values.isStarred,
        folder: values.folder,
        labelIds: values.labelIds,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();

  if (!upserted) {
    throw new Error('Failed to upsert email message');
  }

  return upserted;
}

export async function getEmailMessageById({ id }: { id: string }): Promise<EmailMessage | null> {
  const found = await db.query.emailMessage.findFirst({ where: { id } });

  return found ?? null;
}

// Same lookup, with the lazily-persisted body joined in.
// Used by the classify/draft jobs, which always need to know
// whether a body is already stored before deciding to fetch one live.
export async function getEmailMessageWithBodyById({
  id,
}: {
  id: string;
}): Promise<EmailMessageWithBody | null> {
  const found = await db.query.emailMessage.findFirst({
    where: { id },
    with: { body: true },
  });

  return found ?? null;
}

// Every message on a thread, oldest first, body joined in — the draft job's
// context builder.
export async function listEmailMessagesByThreadId({
  threadId,
}: {
  threadId: string;
}): Promise<EmailMessageWithBody[]> {
  return db.query.emailMessage.findMany({
    where: { threadId },
    with: { body: true },
    orderBy: (t, { asc }) => asc(t.sentAt),
  });
}

// Dedup/lookup for the sync job: resolves the provider's message ids for an
// account back to local rows in one query, e.g. to skip already-indexed
// messages in a history.list page.
export async function findEmailMessagesByProviderIds({
  accountId,
  providerMessageIds,
}: {
  accountId: string;
  providerMessageIds: string[];
}): Promise<EmailMessage[]> {
  if (providerMessageIds.length === 0) {
    return [];
  }

  return db.query.emailMessage.findMany({
    where: { accountId, providerMessageId: { in: providerMessageIds } },
  });
}

type UpdateEmailMessageFlagsFields = Partial<
  Pick<NewEmailMessage, 'isUnread' | 'isStarred' | 'folder' | 'labelIds'>
>;

// Mailbox actions (archive/trash/star/read-unread) and the sync job's
// flag-only history.list entries both go through this, never the full
// upsert: a flag change from either source must
// not require re-sending the full message payload.
export async function updateEmailMessageFlags({
  id,
  ...fields
}: { id: string } & UpdateEmailMessageFlagsFields): Promise<EmailMessage | null> {
  const [updated] = await db
    .update(emailMessage)
    .set(fields)
    .where(eq(emailMessage.id, id))
    .returning();

  return updated ?? null;
}

// Written by the classifier job. Accepts
// null so a message can be explicitly uncategorized.
export async function setEmailMessageCategory({
  id,
  categoryId,
}: {
  id: string;
  categoryId: string | null;
}): Promise<EmailMessage | null> {
  const [updated] = await db
    .update(emailMessage)
    .set({ categoryId })
    .where(eq(emailMessage.id, id))
    .returning();

  return updated ?? null;
}

export async function setEmailMessageNeedsReply({
  id,
  needsReply,
}: {
  id: string;
  needsReply: boolean;
}): Promise<EmailMessage | null> {
  const [updated] = await db
    .update(emailMessage)
    .set({ needsReply })
    .where(eq(emailMessage.id, id))
    .returning();

  return updated ?? null;
}

// Combined variant of setEmailMessageCategory + setEmailMessageNeedsReply,
// for the classifier job: it always
// decides both in the same pass, so one round trip instead of two. The two
// single-field setters above stay for callers that only ever touch one
// (e.g. a manual "recategorize" action never touches needsReply).
export async function updateEmailMessageClassification({
  id,
  categoryId,
  needsReply,
}: {
  id: string;
  categoryId: string | null;
  needsReply: boolean;
}): Promise<EmailMessage> {
  const [updated] = await db
    .update(emailMessage)
    .set({ categoryId, needsReply })
    .where(eq(emailMessage.id, id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update email message classification');
  }

  return updated;
}

// Sync's deletion path: purges the local
// row, its body cascades away with it (email_message_bodies.messageId FK is
// onDelete: 'cascade'). Returns the deleted row (or null if it was already
// gone) so the caller can read its threadId back, e.g. to follow up with
// deleteEmailThreadIfEmpty.
export async function deleteEmailMessageByProviderMessageId({
  accountId,
  providerMessageId,
}: {
  accountId: string;
  providerMessageId: string;
}): Promise<EmailMessage | null> {
  const [deleted] = await db
    .delete(emailMessage)
    .where(
      and(
        eq(emailMessage.accountId, accountId),
        eq(emailMessage.providerMessageId, providerMessageId),
      ),
    )
    .returning();

  return deleted ?? null;
}

// Batch variant, for a history.list page that reports several deletions at
// once.
export async function deleteEmailMessagesByProviderMessageIds({
  accountId,
  providerMessageIds,
}: {
  accountId: string;
  providerMessageIds: string[];
}): Promise<void> {
  if (providerMessageIds.length === 0) {
    return;
  }

  await db
    .delete(emailMessage)
    .where(
      and(
        eq(emailMessage.accountId, accountId),
        inArray(emailMessage.providerMessageId, providerMessageIds),
      ),
    );
}
