// One-off backfill for the media-library migration
// (docs/media-library/migration-prd.md decision 3): creates a `media` row
// for every existing gen_images/gen_videos/social_post_media object and
// points the feature row at it. Idempotent: every step skips rows whose
// media id (or frame media id) is already set.
//
// Already run against the dev DB on 2026-08-04 as part of landing this
// migration; that DB is fully on the final (phase-2) schema now, so running
// this again there is a no-op that errors on the first query (the legacy
// columns it reads are already dropped there, see below). It's kept here to
// replay the same migration in every other environment (staging,
// production, teammates' local DBs) that still needs it.
//
// Lives here rather than in packages/database: it needs an S3 client
// (@repo/storage) purely for a one-time HEAD-based size lookup, and
// packages/database must not carry an R2 dependency for that. apps/api
// already depends on both @repo/database and @repo/storage, so running it
// from here adds zero new dependency edges anywhere in the monorepo.
//
// Only runnable during the phase-1 -> phase-2 window described below: it
// reads storage_key / frame_storage_key / reference_images, which the final
// schema drops. Run it too early (before phase 1) or too late (after phase
// 2) and it fails outright rather than doing partial/incorrect work.
//
// Run this BETWEEN the two db:push runs the PRD describes:
//   1. db:push (packages/database) with the schema in its additive state
//      (nullable media_id / frame_media_id columns and gen_image_reference
//      added, nothing dropped yet).
//   2. This script.
//   3. db:push (packages/database) with the schema in its final state
//      (drops storage_key, frame_storage_key, reference_images; tightens
//      gen_images.media_id and social_post_media.media_id to notNull).
//
// packages/database's schema files ship at that final state (decision 2),
// so `storage_key`, `frame_storage_key` and `reference_images` don't exist
// on the Drizzle table objects @repo/database exports. Every query below
// (both the legacy-column reads and the new-column writes) goes through
// db.execute(sql`...`) rather than the query builder for that reason, and
// to avoid apps/api needing its own `drizzle-orm` dependency just for this
// script (db and sql are both re-exported from @repo/database already).
//
// Usage: pnpm --filter @repo/api backfill:media

import { config } from '@repo/config';
import type { NewGenImageReference } from '@repo/database';
import { createGenImageReferences, createMedia, db, sql } from '@repo/database';
import type { GenImageReferenceOrigin } from '@repo/database/schema';
import { getObjectStat } from '@repo/storage';

interface BackfillSummary {
  mediaRowsCreated: number;
  missingObjects: number;
  genImagesBackfilled: number;
  genImageReferencesCreated: number;
  genImageReferencesUnresolvable: number;
  genVideosBackfilled: number;
  genVideoFramesBackfilled: number;
  genVideoFramesUnresolvable: number;
  socialPostMediaBackfilled: number;
  socialPostMediaUnresolvable: number;
}

function createSummary(): BackfillSummary {
  return {
    mediaRowsCreated: 0,
    missingObjects: 0,
    genImagesBackfilled: 0,
    genImageReferencesCreated: 0,
    genImageReferencesUnresolvable: 0,
    genVideosBackfilled: 0,
    genVideoFramesBackfilled: 0,
    genVideoFramesUnresolvable: 0,
    socialPostMediaBackfilled: 0,
    socialPostMediaUnresolvable: 0,
  };
}

// HEAD the object for its byte size. A missing object (the row was already
// pointing at nothing) is logged and backfilled with size 0 rather than
// failing the whole run. All three producers store in the same images
// bucket (docs/media-library/migration-prd.md decision 3).
async function getObjectSizeOrZero(key: string, summary: BackfillSummary): Promise<number> {
  const stat = await getObjectStat(config.cfImagesBucketName, key);

  if (!stat.exists) {
    console.warn(`  R2 object missing, using size 0: ${key}`);
    summary.missingObjects += 1;
  }

  return stat.size;
}

const IMAGE_MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

function inferImageMimeType(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase();
  return (extension && IMAGE_MIME_TYPE_BY_EXTENSION[extension]) || 'image/png';
}

function filenameFromKey(key: string): string {
  return key.split('/').pop() || key;
}

type RawGenImageRow = {
  id: string;
  workspace_id: string;
  storage_key: string;
  reference_images: { origin: GenImageReferenceOrigin; storageKey: string }[];
  media_id: string | null;
};

// gen_images: one media row per generated output (origin 'generated'),
// keyed to the existing storage key as-is.
async function backfillGenImages(summary: BackfillSummary): Promise<void> {
  const { rows } = await db.execute<RawGenImageRow>(
    sql`SELECT id, workspace_id, storage_key, reference_images, media_id FROM gen_images`,
  );

  for (const row of rows) {
    if (row.media_id) {
      continue;
    }

    const size = await getObjectSizeOrZero(row.storage_key, summary);
    const created = await createMedia({
      ownerWorkspaceId: row.workspace_id,
      bucket: config.cfImagesBucketName,
      storageKey: row.storage_key,
      filename: filenameFromKey(row.storage_key),
      mimeType: inferImageMimeType(row.storage_key),
      size,
      origin: 'generated',
    });
    summary.mediaRowsCreated += 1;

    await db.execute(sql`UPDATE gen_images SET media_id = ${created.id} WHERE id = ${row.id}`);
    summary.genImagesBackfilled += 1;
  }
}

// Resolves a gen_images output's media row by its (unique, still-legacy)
// storage key, for 'genImage'-origin references/frames elsewhere: those
// point at an output that was just backfilled above rather than owning a
// separate object.
async function loadGenImageMediaIdByStorageKey(): Promise<Map<string, string>> {
  const { rows } = await db.execute<{ storage_key: string; media_id: string }>(
    sql`SELECT storage_key, media_id FROM gen_images WHERE media_id IS NOT NULL`,
  );

  return new Map(rows.map((row) => [row.storage_key, row.media_id]));
}

// gen_images.reference_images jsonb -> gen_image_reference rows. 'upload'
// entries get their own new media row ('uploaded'); 'genImage' entries
// resolve to the referenced output's media row by storage key.
async function backfillGenImageReferences(
  genImageMediaIdByStorageKey: Map<string, string>,
  summary: BackfillSummary,
): Promise<void> {
  const { rows: genImageRows } = await db.execute<RawGenImageRow>(
    sql`SELECT id, workspace_id, storage_key, reference_images, media_id FROM gen_images`,
  );

  const { rows: alreadyBackfilled } = await db.execute<{ gen_image_id: string }>(
    sql`SELECT DISTINCT gen_image_id FROM gen_image_reference`,
  );
  const alreadyBackfilledIds = new Set(alreadyBackfilled.map((row) => row.gen_image_id));

  for (const row of genImageRows) {
    if (alreadyBackfilledIds.has(row.id) || row.reference_images.length === 0) {
      continue;
    }

    const references: NewGenImageReference[] = [];

    for (const [index, reference] of row.reference_images.entries()) {
      let mediaId: string | undefined;

      if (reference.origin === 'upload') {
        const size = await getObjectSizeOrZero(reference.storageKey, summary);
        const created = await createMedia({
          ownerWorkspaceId: row.workspace_id,
          bucket: config.cfImagesBucketName,
          storageKey: reference.storageKey,
          filename: filenameFromKey(reference.storageKey),
          mimeType: inferImageMimeType(reference.storageKey),
          size,
          origin: 'uploaded',
        });
        summary.mediaRowsCreated += 1;
        mediaId = created.id;
      } else {
        mediaId = genImageMediaIdByStorageKey.get(reference.storageKey);
      }

      if (!mediaId) {
        console.warn(
          `  unresolvable gen_image_reference: gen image ${row.id}, ` +
            `storage key ${reference.storageKey} (origin ${reference.origin})`,
        );
        summary.genImageReferencesUnresolvable += 1;
        continue;
      }

      references.push({ genImageId: row.id, mediaId, origin: reference.origin, sortOrder: index });
    }

    if (references.length > 0) {
      await createGenImageReferences(references);
      summary.genImageReferencesCreated += references.length;
    }
  }
}

type RawGenVideoRow = {
  id: string;
  workspace_id: string;
  status: string;
  storage_key: string | null;
  frame_origin: GenImageReferenceOrigin | null;
  frame_storage_key: string | null;
  media_id: string | null;
  frame_media_id: string | null;
};

// gen_videos: completed rows with a storage_key get a 'generated' media row
// for the output; frame_storage_key gets its own media row ('upload'
// origin) or resolves to the referenced gen image's media row ('genImage'
// origin), same split as gen_image_reference above.
async function backfillGenVideos(
  genImageMediaIdByStorageKey: Map<string, string>,
  summary: BackfillSummary,
): Promise<void> {
  const { rows } = await db.execute<RawGenVideoRow>(
    sql`SELECT id, workspace_id, status, storage_key, frame_origin, frame_storage_key, media_id, frame_media_id
        FROM gen_videos`,
  );

  for (const row of rows) {
    if (!row.media_id && row.status === 'completed' && row.storage_key) {
      const size = await getObjectSizeOrZero(row.storage_key, summary);
      const created = await createMedia({
        ownerWorkspaceId: row.workspace_id,
        bucket: config.cfImagesBucketName,
        storageKey: row.storage_key,
        filename: filenameFromKey(row.storage_key),
        mimeType: 'video/mp4',
        size,
        origin: 'generated',
      });
      summary.mediaRowsCreated += 1;

      await db.execute(sql`UPDATE gen_videos SET media_id = ${created.id} WHERE id = ${row.id}`);
      summary.genVideosBackfilled += 1;
    }

    if (!row.frame_media_id && row.frame_origin && row.frame_storage_key) {
      let frameMediaId: string | undefined;

      if (row.frame_origin === 'upload') {
        const size = await getObjectSizeOrZero(row.frame_storage_key, summary);
        const created = await createMedia({
          ownerWorkspaceId: row.workspace_id,
          bucket: config.cfImagesBucketName,
          storageKey: row.frame_storage_key,
          filename: filenameFromKey(row.frame_storage_key),
          mimeType: inferImageMimeType(row.frame_storage_key),
          size,
          origin: 'uploaded',
        });
        summary.mediaRowsCreated += 1;
        frameMediaId = created.id;
      } else {
        frameMediaId = genImageMediaIdByStorageKey.get(row.frame_storage_key);
      }

      if (!frameMediaId) {
        console.warn(
          `  unresolvable gen_video frame: gen video ${row.id}, ` +
            `storage key ${row.frame_storage_key} (origin ${row.frame_origin})`,
        );
        summary.genVideoFramesUnresolvable += 1;
        continue;
      }

      await db.execute(sql`UPDATE gen_videos SET frame_media_id = ${frameMediaId} WHERE id = ${row.id}`);
      summary.genVideoFramesBackfilled += 1;
    }
  }
}

type RawSocialPostMediaRow = {
  id: string;
  storage_key: string;
  mime_type: string;
  origin: GenImageReferenceOrigin;
  workspace_id: string;
};

// social_post_media: 'upload' rows get their own new media row; 'genImage'
// rows (agent-attached) resolve to the referenced gen image's media row by
// storage key, same as everywhere else above. A row that can't resolve is
// left with a null media_id and reported: it would violate the notNull
// tightening in the phase-2 push, so the operator needs to see it.
async function backfillSocialPostMedia(
  genImageMediaIdByStorageKey: Map<string, string>,
  summary: BackfillSummary,
): Promise<void> {
  const { rows } = await db.execute<RawSocialPostMediaRow>(sql`
    SELECT spm.id, spm.storage_key, spm.mime_type, spm.origin, sp.workspace_id
    FROM social_post_media spm
    JOIN social_posts sp ON sp.id = spm.social_post_id
    WHERE spm.media_id IS NULL
  `);

  for (const row of rows) {
    let mediaId: string | undefined;

    if (row.origin === 'upload') {
      const size = await getObjectSizeOrZero(row.storage_key, summary);
      const created = await createMedia({
        ownerWorkspaceId: row.workspace_id,
        bucket: config.cfImagesBucketName,
        storageKey: row.storage_key,
        filename: filenameFromKey(row.storage_key),
        mimeType: row.mime_type,
        size,
        origin: 'uploaded',
      });
      summary.mediaRowsCreated += 1;
      mediaId = created.id;
    } else {
      mediaId = genImageMediaIdByStorageKey.get(row.storage_key);
    }

    if (!mediaId) {
      console.warn(
        `  unresolvable social_post_media: row ${row.id}, ` +
          `storage key ${row.storage_key} (origin ${row.origin})`,
      );
      summary.socialPostMediaUnresolvable += 1;
      continue;
    }

    await db.execute(sql`UPDATE social_post_media SET media_id = ${mediaId} WHERE id = ${row.id}`);
    summary.socialPostMediaBackfilled += 1;
  }
}

function printSummary(summary: BackfillSummary): void {
  console.log('\nBackfill summary:');
  console.log(`  media rows created:                ${summary.mediaRowsCreated}`);
  console.log(`  R2 objects missing (size 0):        ${summary.missingObjects}`);
  console.log(`  gen_images backfilled:              ${summary.genImagesBackfilled}`);
  console.log(`  gen_image_reference created:        ${summary.genImageReferencesCreated}`);
  console.log(`  gen_image_reference unresolvable:   ${summary.genImageReferencesUnresolvable}`);
  console.log(`  gen_videos backfilled:              ${summary.genVideosBackfilled}`);
  console.log(`  gen_video frames backfilled:        ${summary.genVideoFramesBackfilled}`);
  console.log(`  gen_video frames unresolvable:       ${summary.genVideoFramesUnresolvable}`);
  console.log(`  social_post_media backfilled:       ${summary.socialPostMediaBackfilled}`);
  console.log(`  social_post_media unresolvable:     ${summary.socialPostMediaUnresolvable}`);

  if (summary.socialPostMediaUnresolvable > 0) {
    console.warn(
      '\n  social_post_media has unresolvable rows: these still have media_id ' +
        'IS NULL and will violate the notNull tightening in the phase-2 ' +
        'db:push. Resolve them by hand before running it.',
    );
  }
}

async function main(): Promise<void> {
  const summary = createSummary();

  console.log('Backfilling gen_images...');
  await backfillGenImages(summary);

  const genImageMediaIdByStorageKey = await loadGenImageMediaIdByStorageKey();

  console.log('Backfilling gen_image_reference...');
  await backfillGenImageReferences(genImageMediaIdByStorageKey, summary);

  console.log('Backfilling gen_videos...');
  await backfillGenVideos(genImageMediaIdByStorageKey, summary);

  console.log('Backfilling social_post_media...');
  await backfillSocialPostMedia(genImageMediaIdByStorageKey, summary);

  printSummary(summary);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
