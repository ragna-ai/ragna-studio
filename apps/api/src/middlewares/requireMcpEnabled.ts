import { config } from '@repo/config';
import { createMiddleware } from 'hono/factory';
import { NotFoundException } from '../exceptions';

// Kill switch (docs/mcp/prd.md P2): /mcp and /mcp-settings/* don't exist
// when MCP is off, not just unauthorized.
export const requireMcpEnabled = createMiddleware(async (c, next) => {
  if (!config.mcpEnabled) {
    throw new NotFoundException();
  }
  await next();
});
