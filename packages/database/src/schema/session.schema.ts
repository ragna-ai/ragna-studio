import * as t from 'drizzle-orm/sqlite-core';
import { sqliteTable } from 'drizzle-orm/sqlite-core';
import { user } from './user.schema';

export const session = sqliteTable('session', {
  id: t.text('id').primaryKey(),
  userId: t
    .text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: t.text('token').notNull().unique(),
  expiresAt: t.integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: t.text('ip_address'),
  userAgent: t.text('user_agent'),
  impersonatedBy: t.text('impersonated_by'),
  createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: t.integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
