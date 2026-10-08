import { boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import type { Media } from './media.schema';
import { media } from './media.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type GenImageStatus = 'pending' | 'processing' | 'completed' | 'failed';
// Kept as local literal unions rather than imported from @repo/ai (which
// depends on @repo/database, so the reverse import would cycle), same
// reasoning as genvideo.schema.ts's GenVideoAspectRatio/GenVideoResolution.
// Structurally identical to imagen.service.ts's own AspectRatio/
// ImageResolution aliases, so a row read off this column needs no cast to
// satisfy that package's function signatures.
export type GenImageAspectRatio = '1:1' | '4:3' | '16:9';
export type GenImageResolution = '1K' | '2K';

// GENERATED IMAGE
export const genImage = pgTable(
  'gen_images',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    status: text('status').notNull().$type<GenImageStatus>().default('pending'),
    // The generated output's media row (specs/media-library/migration-prd.md).
    // Null until the worker uploads the output and mints it
    // (specs/imagegen/worker-execution-prd.md decision 1). No onDelete
    // action, same as chat_attachment.media_id: the DB refuses to delete a
    // media row while a gen image still points at it.
    mediaId: text('media_id').references(() => media.id),
    // Set on failure, cleared on a retry (mirrors gen_videos.error).
    error: text('error'),
    prompt: text('prompt').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    aspectRatio: text('aspect_ratio').$type<GenImageAspectRatio>(),
    resolution: text('resolution').$type<GenImageResolution>(),
    seed: integer('seed'),
    negativePrompt: text('negative_prompt'),
    // Art. 50(4) visible-disclosure toggle (specs/ai-labeling/prd.md part 2):
    // whether the "AI generated" badge was burned into this output.
    visibleWatermark: boolean('visible_watermark').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('genImage_userId_idx').on(table.userId),
    index('genImage_workspaceId_idx').on(table.workspaceId),
    index('genImage_mediaId_idx').on(table.mediaId),
  ],
);

export type GenImage = typeof genImage.$inferSelect;
export type NewGenImage = typeof genImage.$inferInsert;

// GEN IMAGE REFERENCE
// One row per input reference image used to generate a gen_images row
// (specs/media-library/migration-prd.md decision 1). Replaces the old
// reference_images jsonb column: jsonb can't hold a real FK, and refcount
// (countMediaReferences in media.repo.ts) must be able to see these links.
export type GenImageReferenceOrigin = 'upload' | 'genImage';

export const genImageReference = pgTable(
  'gen_image_reference',
  {
    id: primaryIdColumn,
    genImageId: text('gen_image_id')
      .notNull()
      .references(() => genImage.id, { onDelete: 'cascade' }),
    // No onDelete action, same reasoning as genImage.mediaId above.
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    origin: text('origin').notNull().$type<GenImageReferenceOrigin>(),
    // Preserves reference order (the old jsonb column was an ordered array);
    // 0-based, meaningful to the image providers (imagen.service.ts).
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('genImageReference_genImageId_idx').on(table.genImageId),
    index('genImageReference_mediaId_idx').on(table.mediaId),
  ],
);

export type GenImageReference = typeof genImageReference.$inferSelect;
export type NewGenImageReference = typeof genImageReference.$inferInsert;

export type GenImageReferenceWithMedia = GenImageReference & { media: Media };
export type GenImageWithMedia = GenImage & {
  // Nullable like gen_videos' media relation: no object exists yet for a
  // pending/processing/failed row (specs/imagegen/worker-execution-prd.md
  // decision 1).
  media: Media | null;
  references: GenImageReferenceWithMedia[];
};
