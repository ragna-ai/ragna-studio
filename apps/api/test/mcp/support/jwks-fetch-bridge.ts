// apps/api/test/mcp/support/jwks-fetch-bridge.ts
//
// requireMcpAuth verifies the bearer token's signature against the auth
// server's own JWKS, fetched over a real HTTP request to `${baseURL}/jwks`
// (better-auth/oauth-provider's verify.mjs, via @better-fetch/fetch, which
// falls back to globalThis.fetch). The test harness never boots a real
// listener (README: "no port, no server boot"), so that fetch would
// otherwise fail with a connection error. This bridges it back in-process:
// any fetch to that one URL is answered by `app.request()` instead of a
// real socket; every other URL passes through to the real fetch unchanged.
import { app } from '../../../src/app';

let realFetch: typeof fetch | undefined;

function toRequestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function installMcpJwksFetchBridge(): void {
  if (realFetch) return;
  realFetch = globalThis.fetch;

  globalThis.fetch = (async (input, init) => {
    const url = toRequestUrl(input);
    if (url.includes('/auth/jwks')) {
      return app.request(url, init);
    }
    return realFetch!(input, init);
  }) as typeof fetch;
}

export function uninstallMcpJwksFetchBridge(): void {
  if (!realFetch) return;
  globalThis.fetch = realFetch;
  realFetch = undefined;
}
