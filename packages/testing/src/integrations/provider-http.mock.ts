// Fakes the OAuth provider HTTP endpoints (token, profile, revoke) that @repo/integrations calls.
// Installed once on import; any other URL falls through to the real fetch.
import { INTEGRATION_CATALOG, type ProviderId } from '@repo/integrations';

export interface FakeProviderProfile {
  id: string;
  email: string | null;
  name: string | null;
}

export interface FakeTokenRequest {
  provider: ProviderId;
  form: URLSearchParams;
}

export interface FakeRevokeRequest {
  provider: ProviderId;
  token: string;
}

interface ProviderEndpoint {
  provider: ProviderId;
  kind: 'token' | 'profile' | 'revoke';
}

const ENDPOINTS: Array<{ matches: (url: URL) => boolean } & ProviderEndpoint> = [
  {
    provider: 'google',
    kind: 'token',
    matches: (url) => url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token',
  },
  {
    provider: 'google',
    kind: 'revoke',
    matches: (url) => url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke',
  },
  {
    provider: 'google',
    kind: 'profile',
    matches: (url) => url.hostname === 'openidconnect.googleapis.com',
  },
  {
    provider: 'microsoft',
    kind: 'token',
    matches: (url) =>
      url.hostname === 'login.microsoftonline.com' && url.pathname.endsWith('/token'),
  },
  {
    provider: 'microsoft',
    kind: 'profile',
    matches: (url) => url.hostname === 'graph.microsoft.com',
  },
  {
    provider: 'linkedin',
    kind: 'token',
    matches: (url) => url.hostname === 'www.linkedin.com' && url.pathname.endsWith('/accessToken'),
  },
  {
    provider: 'linkedin',
    kind: 'revoke',
    matches: (url) => url.hostname === 'www.linkedin.com' && url.pathname.endsWith('/revoke'),
  },
  {
    provider: 'linkedin',
    kind: 'profile',
    matches: (url) => url.hostname === 'api.linkedin.com' && url.pathname === '/v2/userinfo',
  },
];

const IDENTITY_SCOPES = ['openid', 'profile', 'email'];

function defaultScopes(provider: ProviderId): string[] {
  const featureScopes = INTEGRATION_CATALOG.filter(
    (integration) => integration.provider === provider,
  ).flatMap((integration) => integration.scopes);

  return IDENTITY_SCOPES.concat(featureScopes);
}

function defaultProfile(provider: ProviderId): FakeProviderProfile {
  return { id: `${provider}-account-1`, email: `user@${provider}.test`, name: 'Test User' };
}

export interface ProviderHttpState {
  profiles: Partial<Record<ProviderId, FakeProviderProfile>>;
  grantedScopes: Partial<Record<ProviderId, string[]>>;
  refreshRejected: Set<ProviderId>;
  tokenRequests: FakeTokenRequest[];
  revokeRequests: FakeRevokeRequest[];
  profileTokens: string[];
}

function emptyState(): ProviderHttpState {
  return {
    profiles: {},
    grantedScopes: {},
    refreshRejected: new Set(),
    tokenRequests: [],
    revokeRequests: [],
    profileTokens: [],
  };
}

export const providerHttp: ProviderHttpState = emptyState();

export function resetProviderHttpMock(): void {
  Object.assign(providerHttp, emptyState());
}

/** The profile the provider reports for the next connect. */
export function setProviderProfile(provider: ProviderId, profile: FakeProviderProfile): void {
  providerHttp.profiles[provider] = profile;
}

/** The scopes the provider reports as granted on the next code exchange. */
export function setProviderGrantedScopes(provider: ProviderId, scopes: string[]): void {
  providerHttp.grantedScopes[provider] = scopes;
}

/** Makes every refresh for the provider fail the way a revoked grant does. */
export function rejectProviderRefresh(provider: ProviderId): void {
  providerHttp.refreshRejected.add(provider);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function readForm(init: RequestInit | undefined): Promise<URLSearchParams> {
  const body = init?.body;
  return body instanceof URLSearchParams ? body : new URLSearchParams(String(body ?? ''));
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// better-auth decodes the ID token of a sign-in grant without verifying its signature.
function buildIdToken(provider: ProviderId): string {
  const profile = providerHttp.profiles[provider] ?? defaultProfile(provider);
  const claims = {
    sub: profile.id,
    oid: profile.id,
    email: profile.email,
    email_verified: true,
    xms_edov: true,
    name: profile.name,
    tid: 'test-tenant-id',
  };

  return `${base64Url({ alg: 'none' })}.${base64Url(claims)}.signature`;
}

function grantedScopes(provider: ProviderId): string[] {
  return providerHttp.grantedScopes[provider] ?? defaultScopes(provider);
}

// Response shapes follow what each provider documents for its token endpoint.
function codeGrantBody(provider: ProviderId): Record<string, unknown> {
  const accessToken = `granted-access-token-${provider}`;
  const idToken = buildIdToken(provider);

  switch (provider) {
    case 'google':
      return {
        access_token: accessToken,
        id_token: idToken,
        refresh_token: `granted-refresh-token-${provider}`,
        expires_in: 3599,
        scope: grantedScopes(provider).join(' '),
        token_type: 'Bearer',
      };
    case 'microsoft':
      return {
        access_token: accessToken,
        id_token: idToken,
        refresh_token: `granted-refresh-token-${provider}`,
        token_type: 'Bearer',
        scope: grantedScopes(provider).join(' '),
        expires_in: 3599,
        ext_expires_in: 3599,
      };
    case 'linkedin':
      return {
        access_token: accessToken,
        id_token: idToken,
        expires_in: 5184000,
        scope: grantedScopes(provider).join(','),
        token_type: 'Bearer',
      };
  }
}

function refreshGrantBody(provider: ProviderId): Record<string, unknown> {
  switch (provider) {
    case 'google':
      return {
        access_token: 'refreshed-access-token',
        expires_in: 3599,
        scope: grantedScopes(provider).join(' '),
        token_type: 'Bearer',
        id_token: buildIdToken(provider),
      };
    case 'microsoft':
      return {
        token_type: 'Bearer',
        scope: grantedScopes(provider).join(' '),
        expires_in: 3599,
        ext_expires_in: 3599,
        access_token: 'refreshed-access-token',
        refresh_token: 'rotated-refresh-token-microsoft',
        id_token: buildIdToken(provider),
      };
    case 'linkedin':
      return {
        access_token: 'refreshed-access-token',
        expires_in: 5184000,
        refresh_token: 'rotated-refresh-token-linkedin',
        refresh_token_expires_in: 31536000,
      };
  }
}

function answerToken(provider: ProviderId, form: URLSearchParams): Response {
  providerHttp.tokenRequests.push({ provider, form });

  if (form.get('grant_type') === 'refresh_token') {
    if (providerHttp.refreshRejected.has(provider)) {
      return json({ error: 'invalid_grant' }, 400);
    }
    return json(refreshGrantBody(provider));
  }

  return json(codeGrantBody(provider));
}

function answerProfile(provider: ProviderId, request: RequestInit | undefined): Response {
  const authorization = new Headers(request?.headers).get('authorization') ?? '';
  providerHttp.profileTokens.push(authorization.replace(/^Bearer /, ''));

  const profile = providerHttp.profiles[provider] ?? defaultProfile(provider);
  if (provider === 'microsoft') {
    return json({
      id: profile.id,
      displayName: profile.name,
      mail: profile.email,
      userPrincipalName: profile.email,
    });
  }
  return json({ sub: profile.id, email: profile.email, name: profile.name });
}

async function route(endpoint: ProviderEndpoint, init: RequestInit | undefined) {
  if (endpoint.kind === 'profile') return answerProfile(endpoint.provider, init);

  const form = await readForm(init);
  if (endpoint.kind === 'revoke') {
    providerHttp.revokeRequests.push({
      provider: endpoint.provider,
      token: form.get('token') ?? '',
    });
    return json({});
  }
  return answerToken(endpoint.provider, form);
}

const realFetch = globalThis.fetch;

const fakeFetchImpl = async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const endpoint = ENDPOINTS.find((candidate) => candidate.matches(url));
  if (!endpoint) return realFetch(input, init);

  return route(endpoint, init);
};

globalThis.fetch = Object.assign(fakeFetchImpl, { preconnect: realFetch.preconnect });
