// apps/api/test/mcp/support/mcp-fixtures.ts
import { auth } from '@repo/auth/server';
import { config } from '@repo/config';
import type { McpAccess, McpConnection } from '@repo/database';
import { db, upsertMcpConnection, upsertMcpSettings } from '@repo/database';
import { oauthClient } from '@repo/database/schema';

export const TEST_MCP_CLIENT_ID = 'https://claude.example/mcp-client-metadata.json';

interface JwtSigningApi {
  signJWT(options: { body: { payload: Record<string, unknown> } }): Promise<{ token: string }>;
}

// oauthClient rows are normally written by @better-auth/cimd during
// discovery (packages/database/src/schema/oauth-provider.schema.ts); tests
// seed one directly so mcp_connections has a client to join against.
export async function seedOAuthClient({
  clientId = TEST_MCP_CLIENT_ID,
  name = 'Claude Desktop',
}: {
  clientId?: string;
  name?: string;
} = {}): Promise<void> {
  await db.insert(oauthClient).values({ clientId, name, redirectUris: [] });
}

export async function seedMcpConnection({
  userId,
  workspaceId,
  clientId = TEST_MCP_CLIENT_ID,
  access,
}: {
  userId: string;
  workspaceId: string;
  clientId?: string;
  access: McpAccess;
}): Promise<McpConnection> {
  await upsertMcpSettings({ userId, enabled: true, access });
  return upsertMcpConnection({ userId, clientId, workspaceId });
}

/**
 * Signs an MCP access token with the same claim shape the real OAuth
 * Provider token endpoint issues (sub, aud, client_id/azp, scope, iss), via
 * the jwt() plugin's server-only `signJWT` endpoint. Running the actual
 * CIMD + authorize + token-exchange flow would fetch the client's metadata
 * document over real HTTPS, which is unnecessary just to exercise
 * requireMcpAuth's verification and the connection lookup. `auth.api` is
 * cast to the narrow slice this needs: `auth` is exported `as unknown as
 * ReturnType<typeof betterAuth>` (packages/auth/src/server/auth.ts), which
 * erases plugin-contributed methods like `signJWT`, the same issue
 * `packages/testing/src/auth/auth-seed.ts` documents for `ctx.test`.
 */
export async function mintMcpAccessToken({
  userId,
  clientId = TEST_MCP_CLIENT_ID,
  scope = 'mcp offline_access',
  audience = config.mcpResourceUrl,
  expiresInSeconds = 3600,
}: {
  userId: string;
  clientId?: string;
  scope?: string;
  audience?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { baseURL } = await auth.$context;
  const jwtApi = auth.api as unknown as JwtSigningApi;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const { token } = await jwtApi.signJWT({
    body: {
      payload: {
        sub: userId,
        aud: audience,
        iss: baseURL,
        client_id: clientId,
        azp: clientId,
        scope,
        iat: nowSeconds,
        exp: nowSeconds + expiresInSeconds,
      },
    },
  });

  return token;
}
