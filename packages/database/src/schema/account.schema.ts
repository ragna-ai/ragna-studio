import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryIdColumn } from './common.schema';
import { user } from './user.schema';

export const account = pgTable(
  'account',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    // better-auth 1.7 account-selector API: identifies the OAuth issuer that
    // vouches for `accountId` (e.g. "https://accounts.google.com"). Existing
    // rows were backfilled via apps/worker/src/scripts/backfill-account-issuer.ts
    // before this column was tightened to NOT NULL.
    issuer: text('issuer').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('account_userId_idx').on(table.userId),
    uniqueIndex('account_issuer_accountId_idx').on(table.issuer, table.accountId),
  ],
);

export type Account = typeof account.$inferSelect;
