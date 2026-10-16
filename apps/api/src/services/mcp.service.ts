import { auth, requireMcpAuth } from '@repo/auth/server';
import type { McpAccess } from '@repo/database';
import {
  findMcpConnection,
  getMcpSettings,
  recordMcpToolCall,
  touchMcpConnection,
} from '@repo/database';
import type { ToolDefinition } from '@repo/ai';
import { config } from '@repo/config';
import { logger } from '@repo/logger';
import type { CallToolResult } from '@modelcontextprotocol/server';
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  McpServer,
} from '@modelcontextprotocol/server';
import * as z from 'zod';
import { mcpAccessSchema } from '../validation/mcp-settings.schema';
import { getAllowedToolDefinitions } from './mcp-integrations';

const MCP_SERVER_NAME = 'ragna';
const MCP_SERVER_VERSION = '1.0.0';

export interface McpConnectionScope {
  connectionId: string;
  userId: string;
  clientId: string;
  workspaceId: string;
  access: McpAccess;
}

const mcpConnectionScopeSchema = z.object({
  connectionId: z.string(),
  userId: z.string(),
  clientId: z.string(),
  workspaceId: z.string(),
  access: mcpAccessSchema,
});

async function resolveMcpConnectionScope({
  userId,
  clientId,
}: {
  userId: string;
  clientId: string;
}): Promise<McpConnectionScope | null> {
  const settings = await getMcpSettings({ userId });
  if (!settings.enabled) {
    return null;
  }

  const connection = await findMcpConnection({ userId, clientId });
  if (!connection) {
    return null;
  }

  return {
    connectionId: connection.id,
    userId,
    clientId,
    workspaceId: connection.workspaceId,
    access: settings.access,
  };
}

const toolErrorOutputSchema = z.object({ error: z.string() });
const jsonObjectOutputSchema = z.record(z.string(), z.unknown());

// PRD mapping: an `{ error }` output becomes
// `isError: true` with the message as text; anything else becomes
// `structuredContent` plus the same JSON as text. Returns the SDK's own
// CallToolResult type directly rather than a hand-rolled shape, so it's
// assignable to registerTool's callback without a cast.
function toMcpToolCallResult(output: unknown): CallToolResult {
  const errorOutput = toolErrorOutputSchema.safeParse(output);
  if (errorOutput.success) {
    return { isError: true, content: [{ type: 'text', text: errorOutput.data.error }] };
  }

  const objectOutput = jsonObjectOutputSchema.safeParse(output);
  return {
    content: [{ type: 'text', text: JSON.stringify(output) }],
    structuredContent: objectOutput.success ? objectOutput.data : undefined,
  };
}

const datasetIdInputSchema = z.object({ datasetId: z.string() });

function extractResourceId(input: unknown): string | null {
  const parsed = datasetIdInputSchema.safeParse(input);
  return parsed.success ? parsed.data.datasetId : null;
}

// Best-effort: the tool already ran, so a failure here must not surface to the client.
async function recordMcpToolCallOutcome(
  scope: McpConnectionScope,
  definition: ToolDefinition<z.ZodObject, unknown>,
  input: unknown,
  result: CallToolResult,
): Promise<void> {
  try {
    await touchMcpConnection({ connectionId: scope.connectionId });
    await recordMcpToolCall({
      connectionId: scope.connectionId,
      userId: scope.userId,
      clientId: scope.clientId,
      workspaceId: scope.workspaceId,
      toolName: definition.name,
      access: definition.access,
      resourceId: extractResourceId(input),
      isError: result.isError ?? false,
    });
  } catch (error) {
    logger.warn(
      `Failed to record MCP tool call bookkeeping for tool ${definition.name} (connection ${scope.connectionId})`,
      error,
    );
  }
}

// The one MCP adapter: turns a transport-neutral
// ToolDefinition into an MCP tool, recording every call and touching the
// connection's last_used_at (P7).
function registerMcpTool(
  server: McpServer,
  definition: ToolDefinition<z.ZodObject, unknown>,
  scope: McpConnectionScope,
): void {
  server.registerTool(
    definition.name,
    {
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
    },
    async (input) => {
      const output = await definition.execute(input, {
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        origin: 'mcp',
      });
      const result = toMcpToolCallResult(output);

      await recordMcpToolCallOutcome(scope, definition, input, result);

      return result;
    },
  );
}

function buildMcpServer(scope: McpConnectionScope): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });

  for (const definition of getAllowedToolDefinitions(scope.access)) {
    registerMcpTool(server, definition, scope);
  }

  return server;
}

const mcpHttpHandler = createMcpHandler(
  (requestContext) => {
    const scope = mcpConnectionScopeSchema.parse(requestContext.authInfo?.extra);
    return buildMcpServer(scope);
  },
  { legacy: 'reject' },
);

function unauthorizedMcpResponse(message: string): Response {
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(config.mcpResourceUrl));
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer error="invalid_token", error_description="${message}", resource_metadata="${resourceMetadataUrl}"`,
      },
    },
  );
}

function methodNotAllowedMcpResponse(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

// requireMcpAuth verifies the bearer token (signature, expiry, audience =
// the /mcp resource) and hands us the claims. Everything after that -
// connection lookup and settings - is ours.
const mcpAuthGate = requireMcpAuth(
  auth,
  async (request, claims) => {
    if (request.method !== 'POST') {
      return methodNotAllowedMcpResponse();
    }

    const userId = typeof claims.sub === 'string' ? claims.sub : undefined;
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : undefined;
    if (!userId || !clientId) {
      return unauthorizedMcpResponse('Access token is missing a subject or client id.');
    }

    const scope = await resolveMcpConnectionScope({ userId, clientId });
    if (!scope) {
      return unauthorizedMcpResponse(
        'MCP is disabled or this connection was revoked. Reconnect in RAGNA Studio under Settings > MCP.',
      );
    }

    const authorizationHeader = request.headers.get('authorization') ?? '';
    return mcpHttpHandler.fetch(request, {
      authInfo: {
        token: authorizationHeader.replace(/^Bearer\s+/i, ''),
        clientId,
        scopes: typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
        resource: new URL(config.mcpResourceUrl),
        // A fresh object literal, not `scope` itself: a named interface
        // instance (unlike a literal) isn't assignable to AuthInfo.extra's
        // Record<string, unknown> without an index signature.
        extra: {
          connectionId: scope.connectionId,
          userId: scope.userId,
          clientId: scope.clientId,
          workspaceId: scope.workspaceId,
          access: scope.access,
        },
      },
    });
  },
  { resource: config.mcpResourceUrl, requiredScopes: ['mcp'] },
);

export async function handleMcpRequest(request: Request): Promise<Response> {
  return mcpAuthGate(request);
}
