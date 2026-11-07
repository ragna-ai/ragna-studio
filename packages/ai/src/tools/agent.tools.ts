import type { StoredAgentToolGrant } from '@repo/database/schema';
import { logger } from '@repo/logger';
import type { ToolSet, UIMessageStreamWriter } from 'ai';
import { searchContextDocumentsToolDefinition } from './agent-context.tool';
import type * as z from 'zod';
import { agentToolGrantSchema, type AgentToolGrant, type AgentToolId } from './agent-tool-catalog';
import { cloudDriveToolDefinitions } from './cloud-drive.tools';
import { datasetToolDefinitions } from './dataset.tools';
import { documentToolDefinitions } from './document.tools';
import { imageGenToolDefinition } from './image-gen.tool';
import { linkedinDraftToolDefinition } from './linkedin-draft.tool';
import { memoryToolDefinition } from './memory.tool';
import { taskToolDefinitions } from './task.tools';
import { thinkToolDefinition } from './think.tool';
import { videoGenToolDefinition } from './video-gen.tool';
import { webBrowserToolDefinition } from './web-browser.tool';
import { filterByAccess, toAgentTools, type ToolDefinition } from './tool-definition';
import { webSearchToolDefinition } from './web-search.tool';

export interface AgentToolContext {
  userId: string;
  agentId: string;
  workspaceId: string;
  // True when the caller already runs in the worker process (workflow
  // executors). Video and image tools then run inline instead of queueing.
  runsInWorker?: boolean;
  // Set when buildAgentInstructions decides the context needs retrieval.
  // Not part of the agent's own tool grants.
  retrievalMode?: boolean;
  /** The chat stream. Absent in workflows, which have no chat UI. */
  writer?: UIMessageStreamWriter;
}

type AgentToolDefinitions = (
  ctx: AgentToolContext,
) => readonly ToolDefinition<z.ZodObject, unknown>[];

/** The tool definitions behind each agent tool id. Only granted ones are built. */
const agentToolDefinitions = {
  think: () => [thinkToolDefinition],
  datasets: () => datasetToolDefinitions,
  webSearch: () => [webSearchToolDefinition],
  webBrowser: () => [webBrowserToolDefinition],
  memory: (ctx) => [memoryToolDefinition({ agentId: ctx.agentId })],
  linkedinDraft: () => [linkedinDraftToolDefinition],
  'google-drive': () => cloudDriveToolDefinitions('google-drive'),
  documents: (ctx) => documentToolDefinitions({ agentId: ctx.agentId }),
  tasks: (ctx) => taskToolDefinitions({ agentId: ctx.agentId }),
  imageGen: (ctx) => [imageGenToolDefinition({ runsInWorker: ctx.runsInWorker ?? false })],
  videoGen: (ctx) => [videoGenToolDefinition({ runsInWorker: ctx.runsInWorker ?? false })],
} satisfies Record<AgentToolId, AgentToolDefinitions>;

function parseStoredGrants(storedGrants: readonly StoredAgentToolGrant[]): AgentToolGrant[] {
  const grants: AgentToolGrant[] = [];
  const skippedIds: string[] = [];
  for (const stored of storedGrants) {
    const parsed = agentToolGrantSchema.safeParse(stored);
    if (parsed.success) grants.push(parsed.data);
    else skippedIds.push(stored.id);
  }
  if (skippedIds.length > 0) logger.warn('Skipped invalid agent tool grants', skippedIds);
  return grants;
}

/** The definitions a grant gives, limited to its access level when the tool has levels. */
function grantedDefinitions(
  grant: AgentToolGrant,
  ctx: AgentToolContext,
): readonly ToolDefinition<z.ZodObject, unknown>[] {
  const buildDefinitions: AgentToolDefinitions = agentToolDefinitions[grant.id];
  const definitions = buildDefinitions(ctx);
  return 'access' in grant ? filterByAccess(definitions, grant.access) : definitions;
}

/**
 * Builds the `tools` record for an agent from its stored grants. Only granted
 * tools are built. Invalid stored grants are skipped and logged once.
 */
export function buildAgentToolset(
  storedGrants: readonly StoredAgentToolGrant[],
  ctx: AgentToolContext,
): ToolSet {
  const definitions = parseStoredGrants(storedGrants).flatMap((grant) =>
    grantedDefinitions(grant, ctx),
  );
  const retrievalDefinitions = ctx.retrievalMode
    ? [searchContextDocumentsToolDefinition({ agentId: ctx.agentId })]
    : [];

  return toAgentTools([...definitions, ...retrievalDefinitions], {
    toolContext: { userId: ctx.userId, workspaceId: ctx.workspaceId, origin: 'agent' },
    writer: ctx.writer,
    logFields: { agentId: ctx.agentId },
  });
}
