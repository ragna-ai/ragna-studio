import { eq } from 'drizzle-orm';
import { db } from '../db';
import type { EmailAccount, NewEmailAccount } from '../schema';
import { emailAccount } from '../schema';

export type { EmailAccount, EmailAccountSyncState, EmailProvider, NewEmailAccount } from '../schema';

export async function createEmailAccount(values: NewEmailAccount): Promise<EmailAccount> {
  const [created] = await db.insert(emailAccount).values(values).returning();

  if (!created) {
    throw new Error('Failed to create email account');
  }

  return created;
}

// One row per user,
// enforced by the unique index on userId.
export async function getEmailAccountByUserId({
  userId,
}: {
  userId: string;
}): Promise<EmailAccount | null> {
  const found = await db.query.emailAccount.findFirst({ where: { userId } });

  return found ?? null;
}

export async function getEmailAccountById({ id }: { id: string }): Promise<EmailAccount | null> {
  const found = await db.query.emailAccount.findFirst({ where: { id } });

  return found ?? null;
}

// Every connected account still worth polling, for the sync cron's fan-out
// (one email-sync job per connected account). Excludes 'reauth_required' accounts: their stored credentials
// are known dead until the user reconnects,
// so re-enqueuing them every tick would just repeat the same failing Gmail
// call. Reconnecting flips the row back to a syncState this query includes
// (email.service.ts's syncEmailAccountNowForUser also enqueues that first
// sync directly, so the account doesn't have to wait for the next tick to
// resume).
export async function listEmailAccountsDueForSync(): Promise<EmailAccount[]> {
  return db.query.emailAccount.findMany({
    where: { syncState: { ne: 'reauth_required' } },
  });
}

// Email settings page: default draft agent only. Other fields (email
// address, provider) are set once at connect time and never edited here.
export async function updateEmailAccountSettings({
  id,
  defaultAgentId,
}: {
  id: string;
  defaultAgentId: string | null;
}): Promise<EmailAccount | null> {
  const [updated] = await db
    .update(emailAccount)
    .set({ defaultAgentId })
    .where(eq(emailAccount.id, id))
    .returning();

  return updated ?? null;
}

type EmailAccountSyncFields = Partial<
  Pick<NewEmailAccount, 'syncState' | 'syncCursor' | 'lastSyncedAt'>
>;

// Written by the sync job after every poll pass:
// moves syncState, advances the opaque cursor, and stamps
// lastSyncedAt, in whatever combination the caller has ready. A failed pass
// still calls this with just `{ syncState: 'error' }` to surface the state
// without touching the last-good cursor.
export async function updateEmailAccountSyncState({
  id,
  ...fields
}: { id: string } & EmailAccountSyncFields): Promise<EmailAccount | null> {
  const [updated] = await db
    .update(emailAccount)
    .set(fields)
    .where(eq(emailAccount.id, id))
    .returning();

  return updated ?? null;
}

export async function deleteEmailAccountById({ id }: { id: string }): Promise<void> {
  await db.delete(emailAccount).where(eq(emailAccount.id, id));
}
