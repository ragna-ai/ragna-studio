import {
  INTEGRATION_CATALOG,
  findIntegration,
  type IntegrationCategory,
  type IntegrationIdIn,
} from '@repo/integrations/catalog';
import * as z from 'zod';

export const toolAccessSchema = z.enum(['read', 'write']);
export type ToolAccess = z.infer<typeof toolAccessSchema>;

export const BUILTIN_AGENT_TOOL_IDS = [
  'think',
  'webSearch',
  'webBrowser',
  'imageGen',
  'videoGen',
  'linkedinDraft',
  'memory',
  'datasets',
  'documents',
  'tasks',
] as const;
export type BuiltinAgentToolId = (typeof BUILTIN_AGENT_TOOL_IDS)[number];

/** Integration categories whose integrations are agent tools. */
const AGENT_TOOL_INTEGRATION_CATEGORIES = ['cloud-drive'] as const;
type AgentToolIntegrationCategory = (typeof AGENT_TOOL_INTEGRATION_CATEGORIES)[number];

export type IntegrationAgentToolId = IntegrationIdIn<AgentToolIntegrationCategory>;

export type AgentToolId = BuiltinAgentToolId | IntegrationAgentToolId;

function isAgentToolIntegrationCategory(
  category: IntegrationCategory,
): category is AgentToolIntegrationCategory {
  return AGENT_TOOL_INTEGRATION_CATEGORIES.some((candidate) => candidate === category);
}

function isIntegrationAgentToolId(id: string): id is IntegrationAgentToolId {
  const integration = findIntegration(id);
  return integration !== null && isAgentToolIntegrationCategory(integration.category);
}

const INTEGRATION_AGENT_TOOL_IDS: readonly IntegrationAgentToolId[] = INTEGRATION_CATALOG.map(
  (integration) => integration.id,
).filter(isIntegrationAgentToolId);

export interface AgentToolCatalogEntry {
  id: AgentToolId;
  category: 'builtin' | IntegrationCategory;
  hasAccessLevels: boolean;
}

const BUILTIN_CATALOG_ENTRIES: AgentToolCatalogEntry[] = BUILTIN_AGENT_TOOL_IDS.map((id) => ({
  id,
  category: 'builtin',
  hasAccessLevels: false,
}));

const INTEGRATION_CATALOG_ENTRIES: AgentToolCatalogEntry[] = INTEGRATION_CATALOG.flatMap(
  (integration) =>
    isIntegrationAgentToolId(integration.id)
      ? [{ id: integration.id, category: integration.category, hasAccessLevels: true }]
      : [],
);

export const AGENT_TOOL_CATALOG: readonly AgentToolCatalogEntry[] = [
  ...BUILTIN_CATALOG_ENTRIES,
  ...INTEGRATION_CATALOG_ENTRIES,
];

export const agentToolGrantSchema = z.union([
  z.strictObject({ id: z.enum(BUILTIN_AGENT_TOOL_IDS) }),
  z.strictObject({ id: z.enum(INTEGRATION_AGENT_TOOL_IDS), access: toolAccessSchema }),
]);
export type AgentToolGrant = z.infer<typeof agentToolGrantSchema>;

function hasUniqueIds(grants: readonly AgentToolGrant[]): boolean {
  return new Set(grants.map((grant) => grant.id)).size === grants.length;
}

/** Rejects a second grant for the same id. */
export const agentToolGrantsSchema = z
  .array(agentToolGrantSchema)
  .refine(hasUniqueIds, { message: 'Duplicate tool id: an agent can hold one grant per tool' });
