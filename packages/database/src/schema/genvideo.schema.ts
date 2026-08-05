import { type AnyPgColumn, boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import type { Media } from './media.schema';
import { media } from './media.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type GenVideoStatus = 'pending' | 'processing' | 'completed' | 'failed';
// '16:9' / '9:16' are Veo's ratios; the rest are BFL flux-3-video's
// (docs/videogen/prd-v2.md schema section).
export type GenVideoAspectRatio =
  | '21:9'
  | '2:1'
  | '16:9'
  | '4:3'
  | '1:1'
  | '3:4'
  | '9:16'
  | 'auto';
export type GenVideoResolution = '720p' | '1080p';
// 'upload' rows own their object under <userId>/videos/frames/; 'genImage'
// rows reference a gen_images object they don't own (no copy). Same split
// as social_post_media's origin (social-post.schema.ts).
export type GenVideoFrameOrigin = 'upload' | 'genImage';

// GENERATED VIDEO
export const genVideo = pgTable(
  'gen_videos',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    status: text('status').notNull().$type<GenVideoStatus>().default('pending'),
    // The rendered output's media row. Null until the worker uploads the mp4
    // and creates it (docs/media-library/migration-prd.md); no onDelete
    // action, same as chat_attachment.media_id.
    mediaId: text('media_id').references(() => media.id),
    // Set on failure, cleared on a retry.
    error: text('error'),
    prompt: text('prompt').notNull(),
    negativePrompt: text('negative_prompt'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    aspectRatio: text('aspect_ratio').$type<GenVideoAspectRatio>(),
    resolution: text('resolution').$type<GenVideoResolution>(),
    // Seconds.
    duration: integer('duration'),
    generateAudio: boolean('generate_audio').notNull().default(true),
    seed: integer('seed'),
    frameOrigin: text('frame_origin').$type<GenVideoFrameOrigin>(),
    // The first-frame image's media row. Set together with frameOrigin; no
    // onDelete action, same as mediaId above.
    frameMediaId: text('frame_media_id').references(() => media.id),
    // Draft/enhance (docs/videogen/prd-v2.md decision 1). A draft is a normal
    // row with isDraft: true; enhance is a separate row pointing back at it
    // via parentGenVideoId, never an in-place upgrade.
    isDraft: boolean('is_draft').notNull().default(false),
    // R2 key of the persisted encrypted .bin bundle, set when a draft
    // completes. The enhance path downloads it from here instead of BFL's
    // time-limited draftCache URL.
    draftCacheKey: text('draft_cache_key'),
    // Nullable self-FK, set only on enhance rows. The AnyPgColumn return-type
    // annotation breaks the circular type reference (`genVideo` referring to
    // itself), same as task.schema.ts's parentTaskId.
    parentGenVideoId: text('parent_gen_video_id').references((): AnyPgColumn => genVideo.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('genVideo_userId_idx').on(table.userId),
    index('genVideo_workspaceId_idx').on(table.workspaceId),
    index('genVideo_mediaId_idx').on(table.mediaId),
    index('genVideo_frameMediaId_idx').on(table.frameMediaId),
    index('genVideo_parentGenVideoId_idx').on(table.parentGenVideoId),
  ],
);

export type GenVideo = typeof genVideo.$inferSelect;
export type NewGenVideo = typeof genVideo.$inferInsert;

export type GenVideoWithMedia = GenVideo & { media: Media | null; frameMedia: Media | null };
