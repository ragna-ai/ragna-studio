import { Hono } from 'hono';
import { requireMcpEnabled } from '../middlewares/requireMcpEnabled';
import { handleMcpRequest } from '../services/mcp.service';

export const mcpController = new Hono()
  .basePath('/mcp')
  .use(requireMcpEnabled)
  /**
   * [POST] /mcp
   * Streamable HTTP JSON-RPC endpoint for the MCP integration. Other
   * methods 405 (handled inside handleMcpRequest, after auth, so an
   * unauthenticated request to any method still 401s).
   */
  .on(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], '/', (c) => handleMcpRequest(c.req.raw));
