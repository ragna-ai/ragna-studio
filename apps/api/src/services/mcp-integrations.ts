import type { McpAccess, McpIntegrationId } from '@repo/database';
import type { ToolDefinition } from '@repo/ai';
import { datasetToolDefinitions } from '@repo/ai';
import type * as z from 'zod';

// The integration registry (specs/mcp/prd.md, "Scope of the layer"): datasets
// today, more resource types register here as they become MCP integrations.
export const mcpIntegrationDefinitions: Record<McpIntegrationId, ToolDefinition<z.ZodObject, unknown>[]> =
  {
    datasets: datasetToolDefinitions,
  };

/**
 * Tools a connection may use right now, per its live settings (P1): a
 * `read` integration contributes its read-only tools, a `write` integration
 * contributes all of its tools (write implies read). `off` or missing
 * contributes none.
 */
export function getAllowedToolDefinitions(access: McpAccess): ToolDefinition<z.ZodObject, unknown>[] {
  const allowed: ToolDefinition<z.ZodObject, unknown>[] = [];

  for (const integrationId of Object.keys(mcpIntegrationDefinitions) as McpIntegrationId[]) {
    const level = access[integrationId] ?? 'off';
    const definitions = mcpIntegrationDefinitions[integrationId];

    if (level === 'write') {
      allowed.push(...definitions);
    } else if (level === 'read') {
      allowed.push(...definitions.filter((definition) => definition.access === 'read'));
    }
  }

  return allowed;
}
