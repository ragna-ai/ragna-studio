import * as t from 'drizzle-orm/sqlite-core';
import { sqliteTable } from 'drizzle-orm/sqlite-core';

export const verification = sqliteTable('verification', {
  id: t.text('id').primaryKey(),
  identifier: t.text('identifier').notNull(),
  value: t.text('value').notNull(),
  expiresAt: t.integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: t.integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
