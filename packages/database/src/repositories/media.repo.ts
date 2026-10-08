import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db';
import type {
  ChatAttachment,
  ChatAttachmentWithMedia,
  Media,
  NewChatAttachment,
  NewMedia,
} from '../schema';
import {
  chatAttachment,
  genImage,
  genImageReference,
  genVideo,
  media,
  socialPostMedia,
  taskAttachment,
} from '../schema';

export type {
  ChatAttachment,
  ChatAttachmentWithMedia,
  Media,
  MediaOrigin,
  NewChatAttachment,
  NewMedia,
} from '../schema';

// MEDIA

export async function createMedia(values: NewMedia): Promise<Media> {
  const [created] = await db.insert(media).values(values).returning();

  if (!created) {
    throw new Error('Failed to create media');
  }

  return created;
}

export async function getMediaById({ id }: { id: string }): Promise<Media | null> {
  const found = await db.query.media.findFirst({ where: { id } });

  return found ?? null;
}

export async function deleteMediaById({ id }: { id: string }): Promise<void> {
  await db.delete(media).where(eq(media.id, id));
}

// All media owned by a workspace, for the workspace-delete cleanup path:
// their R2 objects must be removed before the FK cascade wipes the rows.
export async function getMediaByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Media[]> {
  return db.query.media.findMany({ where: { ownerWorkspaceId: workspaceId } });
}

// Number of rows still pointing at this media, across every link point in
// the schema. This and
// findUnreferencedMediaOlderThan below are the ONLY two places allowed to
// know the link-point list; every future consumer extends exactly these two
// functions, nowhere else.
export async function countMediaReferences({ mediaId }: { mediaId: string }): Promise<number> {
  const [
    chatAttachmentCount,
    taskAttachmentCount,
    genImageCount,
    genImageReferenceCount,
    genVideoCount,
    genVideoFrameCount,
    socialPostMediaCount,
  ] = await Promise.all([
    db.$count(chatAttachment, eq(chatAttachment.mediaId, mediaId)),
    db.$count(taskAttachment, eq(taskAttachment.mediaId, mediaId)),
    db.$count(genImage, eq(genImage.mediaId, mediaId)),
    db.$count(genImageReference, eq(genImageReference.mediaId, mediaId)),
    db.$count(genVideo, eq(genVideo.mediaId, mediaId)),
    db.$count(genVideo, eq(genVideo.frameMediaId, mediaId)),
    db.$count(socialPostMedia, eq(socialPostMedia.mediaId, mediaId)),
  ]);

  return (
    chatAttachmentCount +
    taskAttachmentCount +
    genImageCount +
    genImageReferenceCount +
    genVideoCount +
    genVideoFrameCount +
    socialPostMediaCount
  );
}

// Safety-net query for the worker sweep cron: media unreferenced by every
// link point above, created more than `hours` ago (covers races and failed
// best-effort R2 deletes at the detach call sites). See the comment on
// countMediaReferences: these two functions are the only ones allowed to
// know the link-point list.
export async function findUnreferencedMediaOlderThan({
  hours,
}: {
  hours: number;
}): Promise<Media[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({ media })
    .from(media)
    .leftJoin(chatAttachment, eq(chatAttachment.mediaId, media.id))
    .leftJoin(taskAttachment, eq(taskAttachment.mediaId, media.id))
    .leftJoin(genImage, eq(genImage.mediaId, media.id))
    .leftJoin(genImageReference, eq(genImageReference.mediaId, media.id))
    .leftJoin(genVideo, or(eq(genVideo.mediaId, media.id), eq(genVideo.frameMediaId, media.id)))
    .leftJoin(socialPostMedia, eq(socialPostMedia.mediaId, media.id))
    .where(
      and(
        isNull(chatAttachment.id),
        isNull(taskAttachment.id),
        isNull(genImage.id),
        isNull(genImageReference.id),
        isNull(genVideo.id),
        isNull(socialPostMedia.id),
        lt(media.createdAt, cutoff),
      ),
    );

  return rows.map((row) => row.media);
}

// CHAT ATTACHMENT

export async function createChatAttachment(values: NewChatAttachment): Promise<ChatAttachment> {
  const [created] = await db.insert(chatAttachment).values(values).returning();

  if (!created) {
    throw new Error('Failed to create chat attachment');
  }

  return created;
}

export async function deleteChatAttachmentById({ id }: { id: string }): Promise<void> {
  await db.delete(chatAttachment).where(eq(chatAttachment.id, id));
}

export async function getChatAttachmentsByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<ChatAttachmentWithMedia[]> {
  return db.query.chatAttachment.findMany({
    where: { chatId },
    with: { media: true },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

export async function getChatAttachmentById({
  id,
}: {
  id: string;
}): Promise<ChatAttachmentWithMedia | null> {
  const found = await db.query.chatAttachment.findFirst({
    where: { id },
    with: { media: true },
  });

  return found ?? null;
}
