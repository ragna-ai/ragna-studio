import { and, desc, eq, exists, notExists, or, sql } from 'drizzle-orm';
import { db } from '../db';
import type { EmailMessage, EmailThread, NewEmailThread } from '../schema';
import { emailMessage, emailThread } from '../schema';

export type { EmailParticipant, EmailThread, NewEmailThread } from '../schema';

export type EmailThreadWithMessages = EmailThread & { messages: EmailMessage[] };

// Upserts on (accountId, providerThreadId): the sync poller writes the same
// thread on every history.list page that touches it (docs/email/prd.md,
// "Sync model"), so this is called far more often than a thread is created.
export async function upsertEmailThreadByProviderThreadId(
  values: NewEmailThread,
): Promise<EmailThread> {
  const [thread] = await db
    .insert(emailThread)
    .values(values)
    .onConflictDoUpdate({
      target: [emailThread.accountId, emailThread.providerThreadId],
      set: {
        subject: values.subject,
        snippet: values.snippet,
        lastMessageAt: values.lastMessageAt,
        participants: values.participants,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();

  if (!thread) {
    throw new Error('Failed to upsert email thread');
  }

  return thread;
}

export interface ListEmailThreadsFilters {
  accountId: string;
  categoryId?: string;
  labelId?: string;
  // Folder-style exclusion (docs/email/prd.md, "Web": system folders derived
  // from Gmail labels). Gmail's Archive isn't a label itself, it's "no
  // INBOX label", so folders like Archive need "has none of these labels"
  // rather than "has this one label" — hence a separate param instead of
  // overloading labelId with negation.
  excludeLabelIds?: string[];
  isStarred?: boolean;
  isUnread?: boolean;
  limit: number;
  offset: number;
}

// jsonb containment: true when labelId is one of the array elements.
function labelContainsCondition(labelId: string) {
  return sql`${emailMessage.labelIds} @> ${JSON.stringify([labelId])}::jsonb`;
}

// Thread-list query for the three-pane client (docs/email/prd.md, "Web").
// category/label/starred/unread all live on email_messages, not the thread
// row, so a filtered list means "threads with at least one matching
// message" — expressed as EXISTS/NOT EXISTS subqueries rather than a join,
// which would need a DISTINCT/GROUP BY to avoid one row per matching
// message. Include and exclude are two independent subqueries (not one
// per-message AND) so "has INBOX" and "has no TRASH/SPAM" don't have to be
// true of the same message row.
export async function listEmailThreads({
  accountId,
  categoryId,
  labelId,
  excludeLabelIds,
  isStarred,
  isUnread,
  limit,
  offset,
}: ListEmailThreadsFilters): Promise<EmailThread[]> {
  const hasIncludeFilter =
    categoryId !== undefined ||
    labelId !== undefined ||
    isStarred !== undefined ||
    isUnread !== undefined;

  const conditions = [eq(emailThread.accountId, accountId)];

  if (hasIncludeFilter) {
    const messageConditions = [eq(emailMessage.threadId, emailThread.id)];

    if (categoryId !== undefined) {
      messageConditions.push(eq(emailMessage.categoryId, categoryId));
    }
    if (isStarred !== undefined) {
      messageConditions.push(eq(emailMessage.isStarred, isStarred));
    }
    if (isUnread !== undefined) {
      messageConditions.push(eq(emailMessage.isUnread, isUnread));
    }
    if (labelId !== undefined) {
      messageConditions.push(labelContainsCondition(labelId));
    }

    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(emailMessage)
          .where(and(...messageConditions)),
      ),
    );
  }

  if (excludeLabelIds && excludeLabelIds.length > 0) {
    const excludeConditions = or(...excludeLabelIds.map(labelContainsCondition));

    conditions.push(
      notExists(
        db
          .select({ one: sql`1` })
          .from(emailMessage)
          .where(and(eq(emailMessage.threadId, emailThread.id), excludeConditions)),
      ),
    );
  }

  return db
    .select()
    .from(emailThread)
    .where(and(...conditions))
    .orderBy(desc(emailThread.lastMessageAt))
    .limit(limit)
    .offset(offset);
}

export async function getEmailThreadById({
  id,
  accountId,
}: {
  id: string;
  accountId: string;
}): Promise<EmailThreadWithMessages | null> {
  const found = await db.query.emailThread.findFirst({
    where: { id, accountId },
    with: { messages: { orderBy: (t, { asc }) => asc(t.sentAt) } },
  });

  return found ?? null;
}

// Plain lookup by the provider's own thread id, e.g. to hydrate a Gmail
// search result (docs/email/prd.md, "API": search proxies Gmail's q=) back
// to our local thread row.
export async function getEmailThreadByProviderThreadId({
  accountId,
  providerThreadId,
}: {
  accountId: string;
  providerThreadId: string;
}): Promise<EmailThread | null> {
  const found = await db.query.emailThread.findFirst({
    where: { accountId, providerThreadId },
  });

  return found ?? null;
}

// Sync's deletion path (docs/email/prd.md, "Sync model": history.list
// applies deletions and purges the local row) removes messages first, then
// calls this to drop threads left with none, since a thread with no
// messages is meaningless.
export async function deleteEmailThreadIfEmpty({ id }: { id: string }): Promise<void> {
  await db
    .delete(emailThread)
    .where(
      and(
        eq(emailThread.id, id),
        notExists(
          db
            .select({ one: sql`1` })
            .from(emailMessage)
            .where(eq(emailMessage.threadId, id)),
        ),
      ),
    );
}
