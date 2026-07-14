import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { NewSocialPost, SocialPost } from '../schema';
import { socialPost } from '../schema';

export type { SocialPost } from '../schema';

export async function createSocialPost(values: NewSocialPost): Promise<SocialPost> {
  const [created] = await db.insert(socialPost).values(values).returning();

  if (!created) {
    throw new Error('Failed to create social post');
  }

  return created;
}

export async function getSocialPostById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<SocialPost | null> {
  const post = await db.query.socialPost.findFirst({
    where: { id, userId },
  });

  return post ?? null;
}

export async function getAllSocialPostsByUserId({
  userId,
}: {
  userId: string;
}): Promise<SocialPost[]> {
  return db.query.socialPost.findMany({
    where: { userId },
    orderBy: (t, { desc }) => desc(t.createdAt),
  });
}

// Only a draft's content can be edited, whether by the agent tool or the user.
export async function updateSocialPostContent({
  id,
  userId,
  content,
}: {
  id: string;
  userId: string;
  content: string;
}): Promise<SocialPost | null> {
  const [updated] = await db
    .update(socialPost)
    .set({ content })
    .where(
      and(eq(socialPost.id, id), eq(socialPost.userId, userId), eq(socialPost.status, 'draft')),
    )
    .returning();

  return updated ?? null;
}

export async function deleteSocialPostById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<void> {
  await db.delete(socialPost).where(and(eq(socialPost.id, id), eq(socialPost.userId, userId)));
}

export async function markSocialPostPublished({
  id,
  userId,
  externalId,
  externalUrl,
}: {
  id: string;
  userId: string;
  externalId: string;
  externalUrl: string;
}): Promise<SocialPost | null> {
  const [updated] = await db
    .update(socialPost)
    .set({
      status: 'published',
      externalId,
      externalUrl,
      publishedAt: new Date(),
      publishError: null,
    })
    .where(and(eq(socialPost.id, id), eq(socialPost.userId, userId)))
    .returning();

  return updated ?? null;
}

export async function markSocialPostFailed({
  id,
  userId,
  publishError,
}: {
  id: string;
  userId: string;
  publishError: string;
}): Promise<SocialPost | null> {
  const [updated] = await db
    .update(socialPost)
    .set({ status: 'failed', publishError })
    .where(and(eq(socialPost.id, id), eq(socialPost.userId, userId)))
    .returning();

  return updated ?? null;
}
