import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import type {
  GenImage,
  GenImageReference,
  GenImageStatus,
  GenImageWithMedia,
  NewGenImage,
  NewGenImageReference,
} from '../schema';
import { genImage, genImageReference } from '../schema';

export type {
  GenImage,
  GenImageAspectRatio,
  GenImageReference,
  GenImageReferenceWithMedia,
  GenImageResolution,
  GenImageStatus,
  GenImageWithMedia,
  NewGenImageReference,
} from '../schema';

export async function createGenImageRecords(records: NewGenImage[]): Promise<GenImage[]> {
  return db.insert(genImage).values(records).returning();
}

// One row per reference image consumed by a batch of createGenImageRecords
// calls (specs/media-library/migration-prd.md decision 1): the caller passes
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
// workspace guard upstream (specs/api-standards/prd.md), so this no longer
// filters by userId. Joins the output media row and every reference's media
// row, so callers never need a second round trip to resolve a storage key
// (specs/media-library/migration-prd.md decision 6).
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

// Plain lookup by id, no ownership scoping (specs/imagegen/worker-execution-
// prd.md decision 3): the gen-images worker and the chat tool's inline
// workflow path both only ever receive ids they created or read off a
// trusted job payload, never a caller-supplied id, the same trust model as
// gen-video.repo.ts's getGenVideoById. Joined the same way as
// getGenImageByIdAndWorkspaceId, so the run side never needs a second round
// trip to resolve a reference's storage key.
export async function getGenImageRowsByIds({
  ids,
}: {
  ids: string[];
}): Promise<GenImageWithMedia[]> {
  if (ids.length === 0) {
    return [];
  }

  return db.query.genImage.findMany({
    where: { id: { in: ids } },
    with: {
      media: true,
      references: { with: { media: true }, orderBy: (t, { asc }) => asc(t.sortOrder) },
    },
  });
}

// visibleWatermark included (specs/ai-labeling/prd.md "Failure semantics"):
// the completion update flips it from "requested" to "actually applied"
// when the watermark attempt failed, so runGenImages (@repo/ai) needs to set
// it alongside status/mediaId on the same call, mirroring
// gen-video.repo.ts's updateGenVideoStatus.
type UpdateGenImageFields = Partial<Pick<NewGenImage, 'mediaId' | 'error' | 'visibleWatermark'>>;

export async function updateGenImageStatus({
  id,
  status,
  ...fields
}: { id: string; status: GenImageStatus } & UpdateGenImageFields): Promise<GenImage> {
  const [updated] = await db
    .update(genImage)
    .set({ status, ...fields })
    .where(eq(genImage.id, id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update gen image status');
  }

  return updated;
}

// Bulk variant of updateGenImageStatus, for the batch-wide transitions a
// gen-images job goes through as a whole (specs/imagegen/worker-execution-
// prd.md decision 2): every row moves to 'processing' together before the
// provider call, and the provider call is all-or-nothing, so a failure marks
// every row in the batch 'failed' with the same message in one statement.
// Per-row completion (different mediaId/visibleWatermark per image) still
// goes through updateGenImageStatus above, one call per row.
export async function updateGenImageStatusByIds({
  ids,
  status,
  error,
}: {
  ids: string[];
  status: GenImageStatus;
  error?: string | null;
}): Promise<GenImage[]> {
  if (ids.length === 0) {
    return [];
  }

  return db
    .update(genImage)
    .set({ status, error })
    .where(inArray(genImage.id, ids))
    .returning();
}

// Reference media ids for a gen image, read BEFORE deleteGenImageByIdAndWorkspaceId
// below: the delete cascades gen_image_reference rows away, so a caller that
// needs to refcount those media ids afterward (specs/media-library/
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
// (specs/media-library/migration-prd.md decision 5). Its gen_image_reference
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
