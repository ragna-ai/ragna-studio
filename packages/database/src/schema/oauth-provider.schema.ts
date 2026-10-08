import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { primaryIdColumn } from './common.schema';
import { session } from './session.schema';
import { user } from './user.schema';

// Tables required by the @better-auth/mcp OAuth provider (mcp(), which wraps
// @better-auth/oauth-provider) and the jwt() plugin, hand-written from their
// installed dist schema definitions (specs/mcp/prd.md, "OAuth"). Column names
// follow the plugin's field names; table names follow this repo's snake_case
// convention.

// JWT PLUGIN: signing keys for the access tokens mcp() issues.
export const jwks = pgTable('jwks', {
  id: primaryIdColumn,
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at').notNull(),
  expiresAt: timestamp('expires_at'),
  alg: text('alg'),
  crv: text('crv'),
});

// OAUTH CLIENT: one row per connected app, keyed by the CIMD client ID URL
// (clientId, specs/mcp/prd.md P4). Discovery-owned rows are created and kept
// in sync by @better-auth/cimd; not written directly by @repo/database.
export const oauthClient = pgTable(
  'oauth_clients',
  {
    id: primaryIdColumn,
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('client_credentials_scopes').array().default([]),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts').array(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types').array(),
    responseTypes: text('response_types').array(),
    requirePKCE: boolean('require_pkce'),
    dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata'),
  },
  (table) => [index('oauthClient_userId_idx').on(table.userId)],
);

// OAUTH RESOURCE: the protected resources the AS issues tokens for. mcp()
// seeds one row for MCP_RESOURCE_URL at boot (resourceSeedMode: insertOnly).
export const oauthResource = pgTable('oauth_resources', {
  id: primaryIdColumn,
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes').array(),
  customClaims: jsonb('custom_claims'),
  dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  policyVersion: integer('policy_version').default(1),
  metadata: jsonb('metadata'),
});

// OAUTH CLIENT RESOURCE: which clients may request which resources
// (authoritative only when enforcePerClientResources is on, the default).
export const oauthClientResource = pgTable(
  'oauth_client_resources',
  {
    id: primaryIdColumn,
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at'),
  },
  (table) => [
    index('oauthClientResource_clientId_idx').on(table.clientId),
    index('oauthClientResource_resourceId_idx').on(table.resourceId),
    uniqueIndex('oauthClientResource_clientId_resourceId_idx').on(
      table.clientId,
      table.resourceId,
    ),
  ],
);

// OAUTH REFRESH TOKEN: opaque, rotated on use. Deleting a client or user
// cascades; the linked session going away only clears sessionId (the token
// is still an offline_access grant, independent of the session that started it).
export const oauthRefreshToken = pgTable(
  'oauth_refresh_tokens',
  {
    id: primaryIdColumn,
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    revoked: timestamp('revoked'),
    rotatedAt: timestamp('rotated_at'),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: timestamp('rotation_replay_expires_at'),
    authTime: timestamp('auth_time'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauthRefreshToken_clientId_idx').on(table.clientId),
    index('oauthRefreshToken_sessionId_idx').on(table.sessionId),
    index('oauthRefreshToken_userId_idx').on(table.userId),
    index('oauthRefreshToken_authorizationCodeId_idx').on(table.authorizationCodeId),
  ],
);

// OAUTH ACCESS TOKEN: only stored for opaque tokens (no resource audience).
// mcp() issues JWT access tokens, so this fills mainly at refresh/introspection.
export const oauthAccessToken = pgTable(
  'oauth_access_tokens',
  {
    id: primaryIdColumn,
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    refreshId: text('refresh_id').references(() => oauthRefreshToken.id),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    revoked: timestamp('revoked'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => [
    index('oauthAccessToken_clientId_idx').on(table.clientId),
    index('oauthAccessToken_sessionId_idx').on(table.sessionId),
    index('oauthAccessToken_userId_idx').on(table.userId),
    index('oauthAccessToken_authorizationCodeId_idx').on(table.authorizationCodeId),
    index('oauthAccessToken_refreshId_idx').on(table.refreshId),
  ],
);

// OAUTH CONSENT: "user has approved client for these scopes", checked on
// repeat authorize requests so a returning connection can skip the consent
// screen. Revoke (deleteAllMcpConnections / deleteMcpConnection) deletes
// these rows via revokeMcpClientGrants.
export const oauthConsent = pgTable(
  'oauth_consents',
  {
    id: primaryIdColumn,
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    scopes: text('scopes').array().notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [
    index('oauthConsent_clientId_idx').on(table.clientId),
    index('oauthConsent_userId_idx').on(table.userId),
  ],
);

// OAUTH CLIENT ASSERTION: single-use jti replay guard for private_key_jwt
// client authentication. Unused while our clients register via CIMD only,
// kept because the OAuth Provider schema always includes it.
export const oauthClientAssertion = pgTable('oauth_client_assertions', {
  id: primaryIdColumn,
  expiresAt: timestamp('expires_at').notNull(),
});
