import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { GenImage, GenImageReference, GenImageWithMedia, NewGenImage, NewGenImageReference } from '../schema';
import { genImage, genImageReference } from '../schema';

export type {
  GenImage,
  GenImageReference,
  GenImageReferenceWithMedia,
  GenImageWithMedia,
  NewGenImageReference,
} from '../schema';

export async function createGenImageRecords(records: NewGenImage[]): Promise<GenImage[]> {
  return db.insert(genImage).values(records).returning();
}

// One row per reference image consumed by a batch of createGenImageRecords
// calls (docs/media-library/migration-prd.md decision 1): the caller passes
// one entry per (genImageId, reference) pair, since a batch generation
// request creates several gen_images rows that each repeat the same
// reference set.
export async function createGenImageReferences(
  records: NewGenImageReference[],
): Promise<GenImageReference[]> {
  if (records.length === 0) {
    return [];
  }

  return db.insert(genImageReference).values(records).returning();
}

// Workspace-scoped list, newest first by default. Access is gated by the
// workspace guard upstream (docs/api-standards/prd.md), so this no longer
// filters by userId. Joins the output media row and every reference's media
// row, so callers never need a second round trip to resolve a storage key
// (docs/media-library/migration-prd.md decision 6).
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
}): Promise<GenImageWithMedia[]> {
  return db.query.genImage.findMany({
    where: { workspaceId },
    orderBy: (t, { asc, desc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
    limit,
    offset,
    with: {
      media: true,
      references: { with: { media: true }, orderBy: (t, { asc }) => asc(t.sortOrder) },
    },
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
// comparing the result length against the requested ids. Callers here only
// ever need the plain mediaId FK (to link it onto their own row), not the
// joined media row, so this stays unjoined.
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
// input (genImageId) and the image-gen "reference this image" input:
// resolves the output media row (storage key, bucket) while rejecting an id
// that belongs to another workspace.
export async function getGenImageByIdAndWorkspaceId({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<GenImageWithMedia | null> {
  const found = await db.query.genImage.findFirst({
    where: { id, workspaceId },
    with: {
      media: true,
      references: { with: { media: true }, orderBy: (t, { asc }) => asc(t.sortOrder) },
    },
  });

  return found ?? null;
}

// Reference media ids for a gen image, read BEFORE deleteGenImageByIdAndWorkspaceId
// below: the delete cascades gen_image_reference rows away, so a caller that
// needs to refcount those media ids afterward (docs/media-library/
// migration-prd.md decision 5) must collect them first.
export async function getGenImageReferenceMediaIds({
  genImageId,
}: {
  genImageId: string;
}): Promise<string[]> {
  const rows = await db.query.genImageReference.findMany({
    where: { genImageId },
    columns: { mediaId: true },
  });

  return rows.map((row) => row.mediaId);
}

// Workspace-scoped delete-and-return: the service needs the deleted row's
// mediaId afterward to refcount-delete its output media
// (docs/media-library/migration-prd.md decision 5). Its gen_image_reference
// rows cascade away with it; call getGenImageReferenceMediaIds first if
// those need refcounting too.
export async function deleteGenImageByIdAndWorkspaceId({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<GenImage | null> {
  const [deleted] = await db
    .delete(genImage)
    .where(and(eq(genImage.id, id), eq(genImage.workspaceId, workspaceId)))
    .returning();

  return deleted ?? null;
}
