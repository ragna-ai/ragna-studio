import { boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
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
    // Object key in the video bucket. Null until the worker uploads the mp4.
    storageKey: text('storage_key'),
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
    // Object key of the first-frame image. Set together with frameOrigin.
    frameStorageKey: text('frame_storage_key'),
    ...timestamps,
  },
  (table) => [
    index('genVideo_userId_idx').on(table.userId),
    index('genVideo_workspaceId_idx').on(table.workspaceId),
  ],
);

export type GenVideo = typeof genVideo.$inferSelect;
export type NewGenVideo = typeof genVideo.$inferInsert;
