import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { primaryIdColumn } from './common.schema';

export const verification = sqliteTable('verification', {
  id: primaryIdColumn,
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
