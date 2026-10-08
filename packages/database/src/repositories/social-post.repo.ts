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

export type {
  SocialPost,
  SocialPostMedia,
  SocialPostMediaOrigin,
  SocialPostMediaWithMedia,
  SocialPostSource,
  SocialPostStatus,
  SocialPostWithMedia,
} from '../schema';

export async function createSocialPost(values: NewSocialPost): Promise<SocialPost> {
  const [created] = await db.insert(socialPost).values(values).returning();

  if (!created) {
    throw new Error('Failed to create social post');
  }

  return created;
}

// Scoped by workspaceId, the access boundary (specs/api-standards/prd.md,
// "Access control"). userId is kept on the row as authorship metadata only.
export async function getSocialPostById({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<SocialPostWithMedia | null> {
  const post = await db.query.socialPost.findFirst({
    where: { id, workspaceId },
    with: {
      media: { orderBy: (t, { asc }) => asc(t.sortOrder), with: { media: true } },
    },
  });

  return post ?? null;
}

export async function getSocialPostCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  return db.$count(socialPost, eq(socialPost.workspaceId, workspaceId));
}

export async function getAllSocialPostsByWorkspaceId({
  workspaceId,
  limit,
  sort = 'desc',
  offset,
}: {
  workspaceId: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}): Promise<SocialPostWithMedia[]> {
  return db.query.socialPost.findMany({
    where: { workspaceId },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
    with: {
      media: { orderBy: (t, { asc }) => asc(t.sortOrder), with: { media: true } },
    },
  });
}

// Only a draft's content can be edited, whether by the agent tool or the user.
export async function updateSocialPostContent({
  id,
  workspaceId,
  content,
}: {
  id: string;
  workspaceId: string;
  content: string;
}): Promise<SocialPost | null> {
  const [updated] = await db
    .update(socialPost)
    .set({ content })
    .where(
      and(
        eq(socialPost.id, id),
        eq(socialPost.workspaceId, workspaceId),
        eq(socialPost.status, 'draft'),
      ),
    )
    .returning();

  return updated ?? null;
}

export async function deleteSocialPostById({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<void> {
  await db
    .delete(socialPost)
    .where(and(eq(socialPost.id, id), eq(socialPost.workspaceId, workspaceId)));
}

export async function markSocialPostPublished({
  id,
  workspaceId,
  externalId,
  externalUrl,
}: {
  id: string;
  workspaceId: string;
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
    .where(and(eq(socialPost.id, id), eq(socialPost.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

export async function markSocialPostFailed({
  id,
  workspaceId,
  publishError,
}: {
  id: string;
  workspaceId: string;
  publishError: string;
}): Promise<SocialPost | null> {
  const [updated] = await db
    .update(socialPost)
    .set({ status: 'failed', publishError })
    .where(and(eq(socialPost.id, id), eq(socialPost.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

// SOCIAL POST MEDIA
//
// None of these take a workspaceId: callers must first load the owning post
// with `getSocialPostById({ id: socialPostId, workspaceId })` to confirm
// ownership, then scope every media operation to that postId. This mirrors
// how the API controller and the agent's social-post.service.ts already have
// to load the post anyway (to check its `draft` status) before touching its
// media.

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
