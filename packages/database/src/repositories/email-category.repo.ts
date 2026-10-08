import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { EmailCategory, NewEmailCategory } from '../schema';
import { emailCategory } from '../schema';

export type { EmailCategory, NewEmailCategory } from '../schema';

export async function listEmailCategoriesByAccountId({
  accountId,
}: {
  accountId: string;
}): Promise<EmailCategory[]> {
  return db.query.emailCategory.findMany({
    where: { accountId },
    orderBy: (t, { asc }) => asc(t.name),
  });
}

export async function getEmailCategoryById({
  id,
  accountId,
}: {
  id: string;
  accountId: string;
}): Promise<EmailCategory | null> {
  const found = await db.query.emailCategory.findFirst({ where: { id, accountId } });

  return found ?? null;
}

export async function createEmailCategory(values: NewEmailCategory): Promise<EmailCategory> {
  const [created] = await db.insert(emailCategory).values(values).returning();

  if (!created) {
    throw new Error('Failed to create email category');
  }

  return created;
}

type UpdateEmailCategoryFields = Partial<
  Pick<NewEmailCategory, 'name' | 'description' | 'color' | 'autoDraft'>
>;

export async function updateEmailCategory({
  id,
  accountId,
  ...fields
}: { id: string; accountId: string } & UpdateEmailCategoryFields): Promise<EmailCategory | null> {
  const [updated] = await db
    .update(emailCategory)
    .set(fields)
    .where(and(eq(emailCategory.id, id), eq(emailCategory.accountId, accountId)))
    .returning();

  return updated ?? null;
}

// FK on email_messages.categoryId is `onDelete: 'set null'`, so deleting a
// category just uncategorizes its messages, it never touches them
// (specs/email/prd.md, "Database").
export async function deleteEmailCategory({
  id,
  accountId,
}: {
  id: string;
  accountId: string;
}): Promise<void> {
  await db
    .delete(emailCategory)
    .where(and(eq(emailCategory.id, id), eq(emailCategory.accountId, accountId)));
}
