import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requireMcpEnabled } from '../middlewares/requireMcpEnabled';
import { handleMcpRequest } from '../services/mcp.service';
import { allowedOrigins } from '../utils/allowed-origins';

// /mcp is its own transport, not a session-authenticated Hono route: bearer
// tokens only (requireMcpAuth inside handleMcpRequest), no cookies, and its
// own CORS (no credentials) per docs/mcp/prd.md section 3.
const mcpCors = cors({
  origin: allowedOrigins,
  credentials: false,
  allowMethods: ['POST'],
  allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Protocol-Version'],
});

export const mcpController = new Hono()
  .basePath('/mcp')
  .use(requireMcpEnabled)
  .use(mcpCors)
  // app.ts's global cors() already ran and set Access-Control-Allow-Credentials
  // for any allowed origin; mcpCors above only sets headers when its own
  // `credentials` option is true, so it never removes that one. Strip it
  // explicitly so /mcp really is the no-credentials policy it claims.
  .use(async (c, next) => {
    await next();
    c.res.headers.delete('Access-Control-Allow-Credentials');
  })
  /**
   * [POST] /mcp
   * Streamable HTTP JSON-RPC endpoint for the MCP integration. Other
   * methods 405 (handled inside handleMcpRequest, after auth, so an
   * unauthenticated request to any method still 401s).
   */
  .on(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], '/', (c) => handleMcpRequest(c.req.raw));
