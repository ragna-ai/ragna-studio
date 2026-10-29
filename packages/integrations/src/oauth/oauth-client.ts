import * as oauth from 'oauth4webapi';
import * as z from 'zod';
import type {
  ExternalAccountProfile,
  ProviderAdapter,
  TokenSet,
} from '../providers/provider.types';
import { getOAuthCallbackUrl } from './callback-url';

const REQUEST_TIMEOUT_MS = 20_000;

/** Everything that differs between providers. The grant logic lives in createOAuthProvider. */
export interface OAuthProviderSpec {
  isConfigured(): boolean;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** Left out where the provider has no revoke endpoint. */
  revocationEndpoint?: string;
  clientId: string;
  clientSecret: string;
  usePkce: boolean;
  /** Always requested, so the profile can be read. */
  identityScopes: string[];
  extraAuthorizeParams?: Record<string, string>;
  getProfile(accessToken: string): Promise<ExternalAccountProfile>;
}

export interface AuthorizationRequest {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

export async function createAuthorizationRequest(): Promise<AuthorizationRequest> {
  const codeVerifier = oauth.generateRandomCodeVerifier();

  return {
    state: oauth.generateRandomState(),
    codeVerifier,
    codeChallenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
  };
}

const tokenBodySchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.union([z.number(), z.string()]).optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * Hook for the token endpoints. Identity comes from each provider's profile endpoint, so the
 * ID token is dropped (its issuer varies with the Microsoft tenant). LinkedIn's refresh
 * response has no token_type, which oauth4webapi requires.
 */
async function normalizeTokenResponse(
  url: string,
  options: oauth.CustomFetchOptions<'POST', URLSearchParams>,
): Promise<Response> {
  const response = await fetch(url, options);
  if (!response.ok) return response;

  const text = await response.text();
  const parsed = tokenBodySchema.safeParse(safeJson(text));
  if (!parsed.success) return new Response(text, response);

  const body = parsed.data;
  return Response.json(
    {
      access_token: body.access_token,
      token_type: body.token_type ?? 'Bearer',
      expires_in: body.expires_in,
      refresh_token: body.refresh_token,
      scope: body.scope,
    },
    { status: response.status, statusText: response.statusText },
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** True when the provider says the grant is gone for good, so retrying cannot help. */
export function isGrantRejectedError(error: unknown): boolean {
  return (
    error instanceof oauth.ResponseBodyError &&
    (error.error === 'invalid_grant' || error.error === 'invalid_token')
  );
}

export function splitScopes(scope: string | undefined): string[] {
  return (scope ?? '').split(/[\s,]+/).filter(Boolean);
}

function toTokenSet(response: oauth.TokenEndpointResponse): TokenSet {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: response.expires_in ? new Date(Date.now() + response.expires_in * 1000) : null,
    scopes: splitScopes(response.scope),
  };
}

export async function fetchProfileJson(url: string, accessToken: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Profile endpoint responded with ${response.status}`);
  }

  return response.json();
}

export function createOAuthProvider(readSpec: () => OAuthProviderSpec): ProviderAdapter {
  function setup() {
    const spec = readSpec();
    const server: oauth.AuthorizationServer = {
      issuer: spec.issuer,
      authorization_endpoint: spec.authorizationEndpoint,
      token_endpoint: spec.tokenEndpoint,
      revocation_endpoint: spec.revocationEndpoint,
    };
    const client: oauth.Client = { client_id: spec.clientId };
    const clientAuth = oauth.ClientSecretPost(spec.clientSecret);
    const requestOptions = {
      [oauth.customFetch]: normalizeTokenResponse,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    return { spec, server, client, clientAuth, requestOptions };
  }

  return {
    isConfigured: () => readSpec().isConfigured(),

    buildAuthorizeUrl({ state, codeChallenge, scopes }) {
      const { spec } = setup();
      const params = new URLSearchParams({
        client_id: spec.clientId,
        redirect_uri: getOAuthCallbackUrl(),
        response_type: 'code',
        scope: spec.identityScopes.concat(scopes).join(' '),
        state,
      });
      if (spec.usePkce) {
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', 'S256');
      }
      for (const [name, value] of Object.entries(spec.extraAuthorizeParams ?? {})) {
        params.set(name, value);
      }

      const url = new URL(spec.authorizationEndpoint);
      url.search = params.toString();
      return url;
    },

    async exchangeCode({ code, state, codeVerifier }) {
      const { spec, server, client, clientAuth, requestOptions } = setup();
      const callback = oauth.validateAuthResponse(
        server,
        client,
        new URLSearchParams({ code, state }),
        state,
      );
      const response = await oauth.authorizationCodeGrantRequest(
        server,
        client,
        clientAuth,
        callback,
        getOAuthCallbackUrl(),
        spec.usePkce ? codeVerifier : oauth.nopkce,
        requestOptions,
      );

      return toTokenSet(await oauth.processAuthorizationCodeResponse(server, client, response));
    },

    async refresh(refreshToken) {
      const { server, client, clientAuth, requestOptions } = setup();
      const response = await oauth.refreshTokenGrantRequest(
        server,
        client,
        clientAuth,
        refreshToken,
        requestOptions,
      );
      const tokens = toTokenSet(await oauth.processRefreshTokenResponse(server, client, response));

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? refreshToken,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      };
    },

    async revoke(token) {
      const { spec, server, client, clientAuth } = setup();
      if (!spec.revocationEndpoint) return;

      const response = await oauth.revocationRequest(server, client, clientAuth, token, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      await oauth.processRevocationResponse(response);
    },

    getAccountProfile: (accessToken) => readSpec().getProfile(accessToken),
  };
}
