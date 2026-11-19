import type { McpAccess, McpIntegrationId } from '@repo/database';
import type { AnyToolDefinition } from '@repo/ai';
import { datasetToolDefinitions, filterByAccess } from '@repo/ai';

// The integration registry: datasets
// today, more resource types register here as they become MCP integrations.
export const mcpIntegrationDefinitions: Record<McpIntegrationId, AnyToolDefinition[]> = {
  datasets: datasetToolDefinitions,
};

/**
 * Tools a connection may use right now, per its live settings (P1): a
 * `read` integration contributes its read-only tools, a `write` integration
 * contributes all of its tools (write implies read). `off` or missing
 * contributes none.
 */
export function getAllowedToolDefinitions(access: McpAccess): AnyToolDefinition[] {
  const allowed: AnyToolDefinition[] = [];

  for (const integrationId of Object.keys(mcpIntegrationDefinitions) as McpIntegrationId[]) {
    const level = access[integrationId] ?? 'off';
    if (level === 'off') continue;
    allowed.push(...filterByAccess(mcpIntegrationDefinitions[integrationId], level));
  }

  return allowed;
}
