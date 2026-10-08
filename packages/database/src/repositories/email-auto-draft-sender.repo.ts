import { and, eq, ilike } from 'drizzle-orm';
import { db } from '../db';
import type { EmailAutoDraftSender } from '../schema';
import { emailAutoDraftSender } from '../schema';

export type { EmailAutoDraftSender, NewEmailAutoDraftSender } from '../schema';

export async function listEmailAutoDraftSenders({
  accountId,
}: {
  accountId: string;
}): Promise<EmailAutoDraftSender[]> {
  return db.query.emailAutoDraftSender.findMany({
    where: { accountId },
    orderBy: (t, { asc }) => asc(t.senderEmail),
  });
}

export async function addEmailAutoDraftSender({
  accountId,
  senderEmail,
}: {
  accountId: string;
  senderEmail: string;
}): Promise<EmailAutoDraftSender> {
  const [created] = await db
    .insert(emailAutoDraftSender)
    .values({ accountId, senderEmail })
    .returning();

  if (!created) {
    throw new Error('Failed to add email auto-draft sender');
  }

  return created;
}

export async function removeEmailAutoDraftSender({
  id,
  accountId,
}: {
  id: string;
  accountId: string;
}): Promise<void> {
  await db
    .delete(emailAutoDraftSender)
    .where(and(eq(emailAutoDraftSender.id, id), eq(emailAutoDraftSender.accountId, accountId)));
}

// Checked by the classifier job for every new message (specs/email/prd.md,
// "Auto-draft replies"): a sender on this list always triggers auto-draft,
// independent of category. Case-insensitive: Gmail addresses are not
// case-sensitive, and the stored casing may not match what a header parser
// hands back.
export async function existsEmailAutoDraftSenderByEmail({
  accountId,
  senderEmail,
}: {
  accountId: string;
  senderEmail: string;
}): Promise<boolean> {
  const [found] = await db
    .select({ id: emailAutoDraftSender.id })
    .from(emailAutoDraftSender)
    .where(
      and(
        eq(emailAutoDraftSender.accountId, accountId),
        ilike(emailAutoDraftSender.senderEmail, senderEmail),
      ),
    )
    .limit(1);

  return found !== undefined;
}
