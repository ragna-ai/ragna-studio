import { eq } from 'drizzle-orm';
import { db } from '../db';
import type { GenImage, NewGenImage } from '../schema';
import { genImage } from '../schema';

export type { GenImage, GenImageReference } from '../schema';

export async function createGenImageRecords(records: NewGenImage[]): Promise<GenImage[]> {
  return db.insert(genImage).values(records).returning();
}

// Workspace-scoped list, newest first by default. Access is gated by the
// workspace guard upstream (docs/api-standards/prd.md), so this no longer
// filters by userId.
export async function getGenImagesByWorkspaceId({
  workspaceId,
  limit,
  offset,
  sort = 'desc',
}: {
  workspaceId: string;
  limit: number;
  offset: number;
  sort?: 'asc' | 'desc';
}): Promise<GenImage[]> {
  return db.query.genImage.findMany({
    where: { workspaceId },
    orderBy: (t, { asc, desc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
    limit,
    offset,
  });
}

// Matches the filters of getGenImagesByWorkspaceId exactly, for pagination meta.
export async function getGenImageCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  return db.$count(genImage, eq(genImage.workspaceId, workspaceId));
}

// Ownership check for attaching gen images to another record (e.g. a
// LinkedIn draft): only returns rows that belong to userId, so a caller can
// tell an attempt to reuse someone else's image apart from a typo'd id by
// comparing the result length against the requested ids.
export async function getGenImagesByIds({
  ids,
  userId,
}: {
  ids: string[];
  userId: string;
}): Promise<GenImage[]> {
  if (ids.length === 0) {
    return [];
  }

  return db.query.genImage.findMany({
    where: { id: { in: ids }, userId },
  });
}

// Workspace-scoped lookup, for the video-gen tool's "animate this image"
// input (genImageId): resolves the storage key while rejecting an id that
// belongs to another workspace.
export async function getGenImageByIdAndWorkspaceId({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<GenImage | null> {
  const found = await db.query.genImage.findFirst({
    where: { id, workspaceId },
  });

  return found ?? null;
}
