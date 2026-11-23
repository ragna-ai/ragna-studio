// packages/media/src/services/media.service.ts
//
// MEDIA DOMAIN.
// Owns storage
// placement and refcounted deletion for the media table. This package
// throws plain Errors and returns results, never HTTP exception classes:
// apps map failures onto their own HTTP layer.

import {
  createMedia,
  deleteMediaByIds,
  findUnreferencedMediaByIds,
  findUnreferencedMediaOlderThan,
  getMediaByWorkspaceId,
  type Media,
  type MediaOrigin,
  type MediaTextExtractionStatus,
  type UnreferencedMedia,
} from '@repo/database';
import { logger } from '@repo/logger';
import { deleteObjects, getObjectStat, uploadObjectBuffer } from '@repo/storage';
import { createPrimaryId, tryCatch } from '@repo/utils';
import { resolveMediaStoragePlacement } from '../lib/media-keys';
import { MIME_TYPE_BY_MEDIA_KIND, type MediaKind } from '../types';

// One owner FK is set at a time (the DB check constraint enforces it); v1
// only ever writes workspaceId, userId is reserved for the personal-library
// flow.
export interface MediaOwner {
  userId?: string;
  workspaceId?: string;
}

function ownerId({ userId, workspaceId }: MediaOwner): string {
  const id = workspaceId ?? userId;

  if (!id) {
    throw new Error('A media owner requires exactly one of userId or workspaceId');
  }

  return id;
}

// STORAGE + CREATION

export interface StoreMediaInput {
  owner: MediaOwner;
  buffer: Buffer;
  filename: string;
  kind: MediaKind;
  origin: MediaOrigin;
  // Tier-2 docs only, capped by the caller before it gets here (e.g. chat's
  // 50,000 char cap). Null for images, pdf, and anything not extracted.
  extractedText?: string | null;
  // Set to 'pending' when the caller enqueues worker extraction afterwards.
  textExtractionStatus?: MediaTextExtractionStatus | null;
}

/**
 * Uploads a buffer to the right bucket/key for its kind (storage placement
 * lives entirely in this package, unified-media-prd.md decision 1) and
 * creates its media row. Extraction is the caller's decision (e.g. chat
 * skips it for pdf, which goes to the model as inlined bytes instead): call
 * `extractText` beforehand and pass the result in.
 */
export async function storeMedia({
  owner,
  buffer,
  filename,
  kind,
  origin,
  extractedText,
  textExtractionStatus,
}: StoreMediaInput): Promise<Media> {
  const mediaId = createPrimaryId();
  const id = ownerId(owner);
  const { bucket, storageKey } = resolveMediaStoragePlacement({ ownerId: id, mediaId, kind });
  const mimeType = MIME_TYPE_BY_MEDIA_KIND[kind];

  await uploadObjectBuffer({ bucketName: bucket, key: storageKey, buffer, contentType: mimeType });

  try {
    return await createMedia({
      id: mediaId,
      ownerUserId: owner.userId ?? null,
      ownerWorkspaceId: owner.workspaceId ?? null,
      bucket,
      storageKey,
      filename,
      mimeType,
      size: buffer.byteLength,
      origin,
      extractedText: extractedText ?? null,
      textExtractionStatus: textExtractionStatus ?? null,
    });
  } catch (createError) {
    await deleteMediaObjects([{ bucket, storageKey }]);
    throw createError;
  }
}

export interface CreateMediaForObjectInput {
  owner: MediaOwner;
  bucket: string;
  storageKey: string;
  mimeType: string;
  origin: MediaOrigin;
  filename?: string;
}

/**
 * Mints a media row for an object that was already uploaded to R2 by an
 * earlier request: the
 * caller hands back a bare storage key with no buffer in hand, so the byte
 * size comes from a HEAD request instead of the upload itself.
 */
export async function createMediaForObject({
  owner,
  bucket,
  storageKey,
  mimeType,
  origin,
  filename,
}: CreateMediaForObjectInput): Promise<Media> {
  const { size } = await getObjectStat(bucket, storageKey);

  return createMedia({
    ownerUserId: owner.userId ?? null,
    ownerWorkspaceId: owner.workspaceId ?? null,
    bucket,
    storageKey,
    filename: filename ?? storageKey.split('/').pop() ?? storageKey,
    mimeType,
    size,
    origin,
  });
}

// DELETION

function objectId(bucket: string, storageKey: string): string {
  return `${bucket}/${storageKey}`;
}

/** Deletes the objects, one call per bucket. Returns the `bucket/key` pairs not confirmed deleted. Never throws. */
async function deleteMediaObjectsReportingFailures(
  objects: { bucket: string; storageKey: string }[],
): Promise<Set<string>> {
  const failedKeys = new Set<string>();
  const storageKeysByBucket: Record<string, string[]> = {};
  for (const { bucket, storageKey } of objects) {
    (storageKeysByBucket[bucket] ??= []).push(storageKey);
  }

  for (const bucket of Object.keys(storageKeysByBucket)) {
    const storageKeys = storageKeysByBucket[bucket];
    const { error, data } = await tryCatch(() => deleteObjects(bucket, storageKeys));

    if (error !== null || !data) {
      logger.error('Failed to delete media objects from R2', { error, bucket, storageKeys });
      storageKeys.forEach((key) => failedKeys.add(objectId(bucket, key)));
      continue;
    }

    if (data.errors.length > 0) {
      logger.error('Failed to delete some media objects from R2', { bucket, keys: data.errors });
      data.errors.forEach((key) => failedKeys.add(objectId(bucket, key)));
    }
  }

  return failedKeys;
}

/** Returns true only when every object was confirmed deleted. Never throws. */
async function deleteMediaObjects(
  objects: { bucket: string; storageKey: string }[],
): Promise<boolean> {
  const failedKeys = await deleteMediaObjectsReportingFailures(objects);
  return failedKeys.size === 0;
}

export interface MediaObjectRef {
  bucket: string;
  key: string;
}

/** Deletes R2 objects by bucket and key. Throws unless every object is deleted, so a job retries. */
export async function deleteMediaObjectsByKeys({
  objects,
}: {
  objects: MediaObjectRef[];
}): Promise<void> {
  const mediaObjects = objects.map(({ bucket, key }) => ({ bucket, storageKey: key }));
  const allDeleted = await deleteMediaObjects(mediaObjects);
  if (!allDeleted) {
    throw new Error('Could not delete all media objects');
  }
}

/**
 * Deletes the R2 objects of every media row a workspace owns, right before the workspace row
 * cascades the media rows away. Unconditional: no refcount check, since the owning rows go
 * with the workspace. Returns true only when every object was confirmed deleted.
 */
export async function deleteWorkspaceMediaObjects({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  const { error, data: mediaRows } = await tryCatch(() => getMediaByWorkspaceId({ workspaceId }));

  if (error !== null || !mediaRows) {
    logger.error(`Failed to load media for workspace ${workspaceId}`, error);
    return false;
  }

  return deleteMediaObjects(mediaRows);
}

/**
 * Deletes media rows and their R2 objects once nothing references them anymore, in a fixed
 * number of queries however many ids come in. The refcount lives in
 * `findUnreferencedMediaByIds` (`@repo/database`). Called from every detach point across every
 * consumer, plus the worker sweep cron (`sweepUnreferencedMedia` below). Best effort: a failed
 * count or R2 delete is logged, not thrown, so it never blocks the action that triggered it.
 * A row whose object could not be deleted stays, so the sweep retries it.
 */
export async function deleteMediaIfUnreferenced({
  mediaIds,
}: {
  mediaIds: string[];
}): Promise<void> {
  if (mediaIds.length === 0) {
    return;
  }

  const { error, data: unreferenced } = await tryCatch(() =>
    findUnreferencedMediaByIds({ ids: mediaIds }),
  );

  if (error !== null || !unreferenced) {
    logger.error('Failed to find unreferenced media for deletion', { error, mediaIds });
    return;
  }

  await deleteUnreferencedMedia(unreferenced);
}

async function deleteUnreferencedMedia(rows: UnreferencedMedia[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const failedKeys = await deleteMediaObjectsReportingFailures(rows);
  const deletableIds = rows
    .filter((row) => !failedKeys.has(objectId(row.bucket, row.storageKey)))
    .map((row) => row.id);

  const { error } = await tryCatch(() => deleteMediaByIds({ ids: deletableIds }));
  if (error !== null) {
    logger.error('Failed to delete media rows', { error, ids: deletableIds });
  }
}

export interface SweepUnreferencedMediaResult {
  // Candidates the sweep found, not a guaranteed delete count: a candidate that picked up a
  // reference since the query ran is skipped, and so is one whose R2 delete failed.
  candidateCount: number;
}

// S3 DeleteObjects accepts at most 1000 keys per call.
export const SWEEP_CANDIDATE_LIMIT = 1000;

/**
 * Safety net for the worker cron:
 * finds the oldest media with zero references older than `olderThanHours` (at most `limit`
 * per run, the rest waits for the next run) and deletes them like every detach point does.
 * Covers races and failed best-effort R2 deletes.
 */
export async function sweepUnreferencedMedia({
  olderThanHours,
  limit = SWEEP_CANDIDATE_LIMIT,
}: {
  olderThanHours: number;
  limit?: number;
}): Promise<SweepUnreferencedMediaResult> {
  const staleMedia = await findUnreferencedMediaOlderThan({ hours: olderThanHours, limit });

  await deleteMediaIfUnreferenced({ mediaIds: staleMedia.map((row) => row.id) });

  return { candidateCount: staleMedia.length };
}
