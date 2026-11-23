import { createMedia, db, sql } from '@repo/database';
import type { Media, MediaTextExtractionStatus } from '@repo/database';
import { media } from '@repo/database/schema';

export interface SeedMediaParams {
  workspaceId: string;
  textExtractionStatus?: MediaTextExtractionStatus | null;
  mimeType?: string;
  createdAt?: Date;
}

export async function seedMedia({
  workspaceId,
  textExtractionStatus = 'pending',
  mimeType = 'text/plain',
  createdAt,
}: SeedMediaParams): Promise<Media> {
  const created = await createMedia({
    ownerWorkspaceId: workspaceId,
    bucket: 'documents',
    storageKey: `media/${crypto.randomUUID()}`,
    filename: 'notes.txt',
    mimeType,
    size: 100,
    origin: 'uploaded',
    textExtractionStatus,
  });

  if (!createdAt) {
    return created;
  }

  await db
    .update(media)
    .set({ createdAt })
    .where(sql`${media.id} = ${created.id}`);
  return { ...created, createdAt };
}
