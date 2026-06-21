import * as t from 'drizzle-orm/sqlite-core';
import { sqliteTable } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: t.text('id').primaryKey(),
  name: t.text('name').notNull(),
  email: t.text('email').notNull().unique(),
  emailVerified: t.integer('email_verified', { mode: 'boolean' }).notNull(),
  image: t.text('image'),
  role: t.text('role'),
  banned: t.integer('banned'),
  banReason: t.text('ban_reason'),
  banExpires: t.integer('ban_expires', { mode: 'timestamp_ms' }),
  createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: t.integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
