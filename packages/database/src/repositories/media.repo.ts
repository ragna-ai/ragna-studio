import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import type { ChatAttachment, ChatAttachmentWithMedia, Media, NewChatAttachment, NewMedia } from '../schema';
import { chatAttachment, media } from '../schema';

export type { ChatAttachment, ChatAttachmentWithMedia, Media, MediaOrigin, NewChatAttachment, NewMedia } from '../schema';

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
export async function getMediaByWorkspaceId({ workspaceId }: { workspaceId: string }): Promise<Media[]> {
  return db.query.media.findMany({ where: { ownerWorkspaceId: workspaceId } });
}

// Number of chat_attachment rows still pointing at this media. The single
// source of truth for refcount deletion (docs/media-library/prd.md); every
// future link table must be added to this count.
export async function countChatAttachmentReferences({ mediaId }: { mediaId: string }): Promise<number> {
  return db.$count(chatAttachment, eq(chatAttachment.mediaId, mediaId));
}

// Safety-net query for the worker sweep cron: media with zero chat_attachment
// references, created more than `hours` ago (covers races and failed
// best-effort R2 deletes at the detach call sites).
export async function findUnreferencedMediaOlderThan({ hours }: { hours: number }): Promise<Media[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({ media })
    .from(media)
    .leftJoin(chatAttachment, eq(chatAttachment.mediaId, media.id))
    .where(and(isNull(chatAttachment.id), lt(media.createdAt, cutoff)));

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

export async function getChatAttachmentById({ id }: { id: string }): Promise<ChatAttachmentWithMedia | null> {
  const found = await db.query.chatAttachment.findFirst({
    where: { id },
    with: { media: true },
  });

  return found ?? null;
}
