import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { EmailMessageBody, NewEmailMessageBody } from '../schema';
import { emailMessageBody } from '../schema';
import { chunkRows, dedupeKeepLast } from '../utils/batch-write';

export type { EmailMessageBody, NewEmailMessageBody } from '../schema';

export async function getEmailMessageBody({
  messageId,
}: {
  messageId: string;
}): Promise<EmailMessageBody | null> {
  const found = await db.query.emailMessageBody.findFirst({ where: { messageId } });

  return found ?? null;
}

// Lazy-persist write path: the first
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

/** Multi-row variant of the upsert above. Repeated `messageId`s keep the last occurrence. */
export async function upsertEmailMessageBodies(
  records: NewEmailMessageBody[],
): Promise<EmailMessageBody[]> {
  const upserted: EmailMessageBody[] = [];

  for (const chunk of chunkRows(dedupeKeepLast(records, (record) => record.messageId))) {
    const written = await db
      .insert(emailMessageBody)
      .values(chunk)
      .onConflictDoUpdate({
        target: emailMessageBody.messageId,
        set: {
          textBody: sql`excluded.text_body`,
          htmlBody: sql`excluded.html_body`,
          updatedAt: sql`(CURRENT_TIMESTAMP)`,
        },
      })
      .returning();
    upserted.push(...written);
  }

  return upserted;
}

export async function deleteEmailMessageBody({ messageId }: { messageId: string }): Promise<void> {
  await db.delete(emailMessageBody).where(eq(emailMessageBody.messageId, messageId));
}
