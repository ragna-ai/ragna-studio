import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryIdColumn } from './common.schema';
import { organization } from './organization.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type IntegrationProviderId = 'google' | 'microsoft' | 'linkedin';
export type IntegrationConnectionStatus = 'active' | 'needs_reauth';

// INTEGRATION CONNECTION
// An external account a feature acts with. Tokens are encrypted envelopes.
export const integrationConnection = pgTable(
  'integration_connections',
  {
    id: primaryIdColumn,
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspace.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull().$type<IntegrationProviderId>(),
    externalAccountId: text('external_account_id').notNull(),
    externalEmail: text('external_email'),
    displayName: text('display_name'),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { precision: 3 }),
    status: text('status').notNull().$type<IntegrationConnectionStatus>().default('active'),
    authFailedAt: timestamp('auth_failed_at', { precision: 3 }),
    authFailedReason: text('auth_failed_reason'),
    lastRefreshedAt: timestamp('last_refreshed_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('integrationConnection_organizationId_idx').on(table.organizationId),
    uniqueIndex('integrationConnection_userId_provider_idx')
      .on(table.userId, table.provider)
      .where(sql`${table.userId} IS NOT NULL`),
    uniqueIndex('integrationConnection_workspaceId_provider_externalAccountId_idx')
      .on(table.workspaceId, table.provider, table.externalAccountId)
      .where(sql`${table.workspaceId} IS NOT NULL`),
    check(
      'integrationConnection_single_owner_check',
      sql`num_nonnulls(${table.userId}, ${table.workspaceId}) = 1`,
    ),
    // The `enc:v1:` prefix is the envelope prefix of @repo/crypto.
    check(
      'integrationConnection_token_envelope_check',
      sql`(${table.accessToken} IS NULL OR ${table.accessToken} LIKE 'enc:v1:%') AND (${table.refreshToken} IS NULL OR ${table.refreshToken} LIKE 'enc:v1:%')`,
    ),
  ],
);

export type IntegrationConnection = typeof integrationConnection.$inferSelect;
export type NewIntegrationConnection = typeof integrationConnection.$inferInsert;

// INTEGRATION OAUTH STATE
// One row per started authorization, consumed once by the callback.
export const integrationOauthState = pgTable(
  'integration_oauth_states',
  {
    state: text('state').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    integrationId: text('integration_id').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    returnPath: text('return_path').notNull(),
    expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
  },
  (table) => [
    index('integrationOauthState_userId_idx').on(table.userId),
    index('integrationOauthState_expiresAt_idx').on(table.expiresAt),
  ],
);

export type IntegrationOauthState = typeof integrationOauthState.$inferSelect;
export type NewIntegrationOauthState = typeof integrationOauthState.$inferInsert;
