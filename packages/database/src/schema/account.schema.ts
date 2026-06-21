import * as t from 'drizzle-orm/sqlite-core';
import { sqliteTable } from 'drizzle-orm/sqlite-core';
import { user } from './user.schema';

export const account = sqliteTable('account', {
  id: t.text('id').primaryKey(),
  userId: t
    .text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: t.text('account_id').notNull(),
  providerId: t.text('provider_id').notNull(),
  accessToken: t.text('access_token'),
  refreshToken: t.text('refresh_token'),
  accessTokenExpiresAt: t.integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: t.integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: t.text('scope'),
  idToken: t.text('id_token'),
  password: t.text('password'),
  createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: t.integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
