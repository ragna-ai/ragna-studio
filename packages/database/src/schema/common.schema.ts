import { sql } from 'drizzle-orm';
import { integer, text } from 'drizzle-orm/sqlite-core';
import { createId } from '../utils/create-id';

export const primaryIdColumn = text('id').$defaultFn(createId).primaryKey();

export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
};
