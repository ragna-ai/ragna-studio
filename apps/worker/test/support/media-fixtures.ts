import { createMedia, db, sql } from '@repo/database';
import type { Media, MediaTextExtractionStatus } from '@repo/database';
import { media } from '@repo/database/schema';

export interface SeedMediaParams {
  workspaceId: string;
  textExtractionStatus?: MediaTextExtractionStatus | null;
  mimeType?: string;
  createdAt?: Date;
  textExtractionAttempts?: number;
}

export async function seedMedia({
  workspaceId,
  textExtractionStatus = 'pending',
  mimeType = 'text/plain',
  createdAt,
  textExtractionAttempts,
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
    textExtractionAttempts,
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
