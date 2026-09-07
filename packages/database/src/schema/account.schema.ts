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
    // better-auth 1.7.0-1.7.2 account-selector API: identified the OAuth
    // issuer that vouches for `accountId`. Better-auth 1.7.3 reverted this;
    // accounts are recognized by providerId + accountId again, as in 1.6, and
    // the core no longer writes this column. Kept nullable rather than
    // dropped per the 1.7 upgrade guide (https://www.better-auth.com/docs/guides/1-7-upgrade-guide).
    issuer: text('issuer'),
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
    uniqueIndex('account_providerId_accountId_idx').on(table.providerId, table.accountId),
  ],
);

export type Account = typeof account.$inferSelect;
