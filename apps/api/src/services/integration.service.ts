import { config } from '@repo/config';
import {
  consumeOauthState,
  createOauthState,
  getOrganizationIdByUserId,
  getUserConnectionById,
  getUserConnectionByProvider,
  listUserConnections,
} from '@repo/database';
import {
  catalogEntrySchema,
  findIntegration,
  createAuthorizationRequest,
  getOAuthProvider,
  INTEGRATION_CATALOG,
  isAppKeyConfigured,
  mergeScopes,
  removeConnection,
  saveUserConnectionGrant,
  toIntegrationConnectionDto,
  type CatalogEntry,
  type IntegrationConnectionDto,
  type IntegrationDefinition,
} from '@repo/integrations';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const CONNECTIONS_PAGE_PATH = '/settings/connections';
const RELATIVE_APP_PATH = /^\/(?!\/)[^\\\s]*$/;
const PROVIDERS_WITH_LOGIN_EMAIL_RULE = new Set(['google', 'microsoft']);

export type IntegrationConnectErrorCode =
  | 'invalid_state'
  | 'invalid_request'
  | 'access_denied'
  | 'provider_error'
  | 'exchange_failed'
  | 'email_mismatch';

/** [GET] /integration/catalog: the integrations whose provider the operator configured. */
export function listConnectableIntegrations(): CatalogEntry[] {
  return INTEGRATION_CATALOG.filter((integration) =>
    getOAuthProvider(integration.provider).isConfigured(),
  ).map((integration) => catalogEntrySchema.parse(integration));
}

/** [GET] /integration/connection */
export async function listConnectionsForUser({
  userId,
}: {
  userId: string;
}): Promise<IntegrationConnectionDto[]> {
  const { error, data: connections } = await tryCatch(() => listUserConnections({ userId }));

  if (error !== null || !connections) {
    logger.error('Failed to list integration connections', error);
    throw new InternalServerErrorException('Failed to list connections');
  }

  return connections.map(toIntegrationConnectionDto);
}

function toSafeReturnPath(returnPath: string): string {
  return RELATIVE_APP_PATH.test(returnPath) ? returnPath : CONNECTIONS_PAGE_PATH;
}

function buildAppRedirect(path: string, errorCode?: IntegrationConnectErrorCode): string {
  const url = new URL(path, config.appUrl);
  if (errorCode) {
    url.searchParams.set('integration_error', errorCode);
  }
  return url.toString();
}

export interface StartIntegrationConnectParams {
  userId: string;
  integrationId: string;
  returnPath: string;
}

/** [POST] /integration/connect: stores the OAuth state and returns the provider's authorize URL. */
export async function startIntegrationConnect({
  userId,
  integrationId,
  returnPath,
}: StartIntegrationConnectParams): Promise<string> {
  const integration = findIntegration(integrationId);
  if (!integration) {
    throw new BadRequestException('Unknown integration');
  }

  if (!isAppKeyConfigured()) {
    throw new BadRequestException('APP_KEY is not set');
  }

  const oauthProvider = getOAuthProvider(integration.provider);
  if (!oauthProvider.isConfigured()) {
    throw new BadRequestException(`${integration.provider} is not configured on this instance`);
  }

  const existing = await getUserConnectionByProvider({ userId, provider: integration.provider });
  const { state, codeVerifier, codeChallenge } = await createAuthorizationRequest();

  const { error } = await tryCatch(() =>
    createOauthState({
      state,
      userId,
      integrationId: integration.id,
      codeVerifier,
      returnPath: toSafeReturnPath(returnPath),
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    }),
  );
  if (error !== null) {
    logger.error('Failed to store the OAuth state', error);
    throw new InternalServerErrorException('Failed to start the connection');
  }

  return oauthProvider
    .buildAuthorizeUrl({
      state,
      codeChallenge,
      scopes: mergeScopes(integration.scopes, existing?.scopes ?? []),
    })
    .toString();
}

export interface CompleteIntegrationConnectParams {
  userId: string;
  userEmail: string;
  state: string | undefined;
  code: string | undefined;
  providerError: string | undefined;
}

/**
 * [GET] /integration/oauth/callback: finishes the grant and returns where to send the browser.
 * Failures redirect with an `integration_error` code instead of a JSON error.
 */
export async function completeIntegrationConnect(
  params: CompleteIntegrationConnectParams,
): Promise<string> {
  if (!params.state) {
    return buildAppRedirect(CONNECTIONS_PAGE_PATH, 'invalid_state');
  }

  const oauthState = await consumeOauthState({ state: params.state, userId: params.userId });
  if (!oauthState) {
    return buildAppRedirect(CONNECTIONS_PAGE_PATH, 'invalid_state');
  }

  const returnPath = toSafeReturnPath(oauthState.returnPath);
  const integration = findIntegration(oauthState.integrationId);

  if (params.providerError) {
    const code = params.providerError === 'access_denied' ? 'access_denied' : 'provider_error';
    return buildAppRedirect(returnPath, code);
  }
  if (!params.code || !integration) {
    return buildAppRedirect(returnPath, 'invalid_request');
  }

  const failure = await saveGrantedConnection({
    userId: params.userId,
    userEmail: params.userEmail,
    integration,
    code: params.code,
    state: params.state,
    codeVerifier: oauthState.codeVerifier,
  });

  return buildAppRedirect(returnPath, failure ?? undefined);
}

interface SaveGrantedConnectionParams {
  userId: string;
  userEmail: string;
  integration: IntegrationDefinition;
  code: string;
  state: string;
  codeVerifier: string;
}

/** Exchanges the code and stores the connection. Returns an error code, or null on success. */
async function saveGrantedConnection({
  userId,
  userEmail,
  integration,
  code,
  state,
  codeVerifier,
}: SaveGrantedConnectionParams): Promise<IntegrationConnectErrorCode | null> {
  const oauthProvider = getOAuthProvider(integration.provider);

  const { error: exchangeError, data: tokens } = await tryCatch(() =>
    oauthProvider.exchangeCode({ code, state, codeVerifier }),
  );
  if (exchangeError !== null || !tokens) {
    logger.error(
      `Failed to exchange the ${integration.provider} authorization code`,
      exchangeError,
    );
    return 'exchange_failed';
  }

  const { error: profileError, data: profile } = await tryCatch(() =>
    oauthProvider.getAccountProfile(tokens.accessToken),
  );
  if (profileError !== null || !profile) {
    logger.error(`Failed to read the ${integration.provider} account profile`, profileError);
    await tryCatch(() => oauthProvider.revoke(tokens.refreshToken ?? tokens.accessToken));
    return 'exchange_failed';
  }

  const emailRuleApplies = PROVIDERS_WITH_LOGIN_EMAIL_RULE.has(integration.provider);
  if (emailRuleApplies && profile.email?.toLowerCase() !== userEmail.toLowerCase()) {
    await tryCatch(() => oauthProvider.revoke(tokens.refreshToken ?? tokens.accessToken));
    return 'email_mismatch';
  }

  const organizationId = await getOrganizationIdByUserId({ userId });
  if (!organizationId) {
    logger.error(`User ${userId} has no organization to hold a connection`);
    return 'provider_error';
  }

  await saveUserConnectionGrant({ organizationId, userId, integration, profile, tokens });

  return null;
}

/** [DELETE] /integration/connection/:connectionId */
export async function removeConnectionForUser({
  userId,
  connectionId,
}: {
  userId: string;
  connectionId: string;
}): Promise<void> {
  const connection = await getUserConnectionById({ id: connectionId, userId });
  if (!connection) {
    throw new NotFoundException('Connection not found');
  }

  const { error } = await tryCatch(() => removeConnection(connection));
  if (error !== null) {
    logger.error('Failed to remove the integration connection', error);
    throw new InternalServerErrorException('Failed to remove the connection');
  }
}
