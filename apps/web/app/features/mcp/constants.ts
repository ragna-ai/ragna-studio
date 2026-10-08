import type { McpIntegrationId } from '~/features/mcp/types';

// Mirrors the integration registry in apps/api (specs/mcp/prd.md, "Resource access").
export const MCP_INTEGRATION_IDS: McpIntegrationId[] = ['datasets'];
