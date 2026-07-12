import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createId } from '../utils/create-id';
import { timestamps } from './common.schema';
import { user } from './user.schema';

// GENERATED IMAGE
export const genImage = sqliteTable(
  'gen_images',
  {
    id: text('id').primaryKey().$defaultFn(createId),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Object key in the image bucket
    storageKey: text('storage_key').notNull(),
    prompt: text('prompt').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    aspectRatio: text('aspect_ratio'),
    resolution: text('resolution'),
    seed: integer('seed'),
    negativePrompt: text('negative_prompt'),
    ...timestamps,
  },
  (table) => [index('genImage_userId_idx').on(table.userId)],
);

export type GenImage = typeof genImage.$inferSelect;
export type NewGenImage = typeof genImage.$inferInsert;
