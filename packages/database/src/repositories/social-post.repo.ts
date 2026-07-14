import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type {
  NewSocialPost,
  NewSocialPostMedia,
  SocialPost,
  SocialPostMedia,
  SocialPostWithMedia,
} from '../schema';
import { socialPost, socialPostMedia } from '../schema';

export type { SocialPost, SocialPostMedia, SocialPostWithMedia } from '../schema';

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
}): Promise<SocialPostWithMedia | null> {
  const post = await db.query.socialPost.findFirst({
    where: { id, userId },
    with: {
      media: { orderBy: (t, { asc }) => asc(t.sortOrder) },
    },
  });

  return post ?? null;
}

export async function getSocialPostCountByUserId({ userId }: { userId: string }): Promise<number> {
  return db.$count(socialPost, eq(socialPost.userId, userId));
}

export async function getAllSocialPostsByUserId({
  userId,
  limit,
  sort = 'desc',
  offset,
}: {
  userId: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}): Promise<SocialPostWithMedia[]> {
  return db.query.socialPost.findMany({
    where: { userId },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
    with: {
      media: { orderBy: (t, { asc }) => asc(t.sortOrder) },
    },
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

// SOCIAL POST MEDIA
//
// None of these take a userId: callers must first load the owning post with
// `getSocialPostById({ id: socialPostId, userId })` to confirm ownership,
// then scope every media operation to that postId. This mirrors how the API
// controller and the agent's social-post.service.ts already have to load the
// post anyway (to check its `draft` status) before touching its media.

export async function createSocialPostMediaRecords(
  records: NewSocialPostMedia[],
): Promise<SocialPostMedia[]> {
  if (records.length === 0) {
    return [];
  }

  return db.insert(socialPostMedia).values(records).returning();
}

export async function updateSocialPostMediaAltText({
  id,
  socialPostId,
  altText,
}: {
  id: string;
  socialPostId: string;
  altText: string;
}): Promise<SocialPostMedia | null> {
  const [updated] = await db
    .update(socialPostMedia)
    .set({ altText })
    .where(and(eq(socialPostMedia.id, id), eq(socialPostMedia.socialPostId, socialPostId)))
    .returning();

  return updated ?? null;
}

export async function deleteSocialPostMediaById({
  id,
  socialPostId,
}: {
  id: string;
  socialPostId: string;
}): Promise<void> {
  await db
    .delete(socialPostMedia)
    .where(and(eq(socialPostMedia.id, id), eq(socialPostMedia.socialPostId, socialPostId)));
}

// Used to replace a draft's whole media set in one go, e.g. when the agent
// tool revises a draft with a new imageIds list.
export async function deleteSocialPostMediaByPostId({
  socialPostId,
}: {
  socialPostId: string;
}): Promise<void> {
  await db.delete(socialPostMedia).where(eq(socialPostMedia.socialPostId, socialPostId));
}
