import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { EmailMessageBody, NewEmailMessageBody } from '../schema';
import { emailMessageBody } from '../schema';

export type { EmailMessageBody, NewEmailMessageBody } from '../schema';

export async function getEmailMessageBody({
  messageId,
}: {
  messageId: string;
}): Promise<EmailMessageBody | null> {
  const found = await db.query.emailMessageBody.findFirst({ where: { messageId } });

  return found ?? null;
}

// Lazy-persist write path (docs/email/prd.md, "Sync model"): the first
// fetch for any reason (classify job, thread-view live fetch) upserts here,
// so a second fetch of the same message is a plain read with no provider
// call.
export async function upsertEmailMessageBody({
  messageId,
  textBody,
  htmlBody,
}: {
  messageId: string;
  textBody: string | null;
  htmlBody: string | null;
}): Promise<EmailMessageBody> {
  const [upserted] = await db
    .insert(emailMessageBody)
    .values({ messageId, textBody, htmlBody })
    .onConflictDoUpdate({
      target: emailMessageBody.messageId,
      set: {
        textBody,
        htmlBody,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();

  if (!upserted) {
    throw new Error('Failed to upsert email message body');
  }

  return upserted;
}

// Batch variant for the classifier processing several new messages from one
// sync pass in a single round trip.
export async function bulkUpsertEmailMessageBodies(
  records: NewEmailMessageBody[],
): Promise<EmailMessageBody[]> {
  if (records.length === 0) {
    return [];
  }

  return db
    .insert(emailMessageBody)
    .values(records)
    .onConflictDoUpdate({
      target: emailMessageBody.messageId,
      set: {
        textBody: sql`excluded.text_body`,
        htmlBody: sql`excluded.html_body`,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();
}

export async function deleteEmailMessageBody({ messageId }: { messageId: string }): Promise<void> {
  await db.delete(emailMessageBody).where(eq(emailMessageBody.messageId, messageId));
}
