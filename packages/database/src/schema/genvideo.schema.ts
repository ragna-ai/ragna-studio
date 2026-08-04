import { boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import type { Media } from './media.schema';
import { media } from './media.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type GenVideoStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type GenVideoAspectRatio = '16:9' | '9:16';
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
    ...timestamps,
  },
  (table) => [
    index('genVideo_userId_idx').on(table.userId),
    index('genVideo_workspaceId_idx').on(table.workspaceId),
    index('genVideo_mediaId_idx').on(table.mediaId),
    index('genVideo_frameMediaId_idx').on(table.frameMediaId),
  ],
);

export type GenVideo = typeof genVideo.$inferSelect;
export type NewGenVideo = typeof genVideo.$inferInsert;

export type GenVideoWithMedia = GenVideo & { media: Media | null; frameMedia: Media | null };
