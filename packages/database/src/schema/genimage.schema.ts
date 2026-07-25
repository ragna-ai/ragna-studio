import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

// 'upload' rows own their object under <userId>/images/references/; 'genImage'
// rows reference a gen_images object they don't own (no copy). Same split
// as gen_videos.frameOrigin (genvideo.schema.ts) and social_post_media's
// origin (social-post.schema.ts).
export type GenImageReferenceOrigin = 'upload' | 'genImage';

export interface GenImageReference {
  origin: GenImageReferenceOrigin;
  storageKey: string;
}

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
    // Object key in the image bucket
    storageKey: text('storage_key').notNull(),
    prompt: text('prompt').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    aspectRatio: text('aspect_ratio'),
    resolution: text('resolution'),
    seed: integer('seed'),
    negativePrompt: text('negative_prompt'),
    referenceImages: jsonb('reference_images').$type<GenImageReference[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [
    index('genImage_userId_idx').on(table.userId),
    index('genImage_workspaceId_idx').on(table.workspaceId),
  ],
);

export type GenImage = typeof genImage.$inferSelect;
export type NewGenImage = typeof genImage.$inferInsert;
