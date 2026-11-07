import type { StoredAgentToolGrant } from '@repo/database/schema';
import { logger } from '@repo/logger';
import type { ToolSet, UIMessageStreamWriter } from 'ai';
import { getSearchContextDocumentsTool } from './agent-context.tool';
import type * as z from 'zod';
import {
  agentToolGrantSchema,
  type AgentToolGrant,
  type AgentToolId,
  type BuiltinAgentToolId,
} from './agent-tool-catalog';
import { cloudDriveToolDefinitions } from './cloud-drive.tools';
import {
  getDatasetAppendRowTool,
  getDatasetCreateTool,
  getDatasetFindTool,
  getDatasetGetRowTool,
  getDatasetListRowsTool,
  getDatasetMoveRowTool,
  getDatasetUpdateRowTool,
} from './dataset.tools';
import {
  getCreateDocumentTool,
  getEditDocumentTool,
  getListDocumentsTool,
  getReadDocumentTool,
} from './document.tools';
import { getGeneratedImages } from './image-gen.tool';
import { getLinkedinDraft } from './linkedin-draft.tool';
import { getMemoryTool } from './memory.tool';
import {
  getCreateTaskTool,
  getListTasksTool,
  getMoveTaskTool,
  getReadTaskTool,
  getUpdateTaskTool,
} from './task.tools';
import { thinkToolDefinition } from './think.tool';
import { getGeneratedVideo } from './video-gen.tool';
import { getWebBrowserResults } from './web-browser.tool';
import {
  filterByAccess,
  toAgentTools,
  type ToolAccess,
  type ToolDefinition,
} from './tool-definition';
import { webSearchToolDefinition } from './web-search.tool';

export type AgentToolContext = {
  userId: string;
  agentId: string;
  workspaceId: string;
  // True when the caller already runs in the worker process (workflow
  // executors). Video and image tools then run inline instead of queueing.
  runsInWorker?: boolean;
  // Set when buildAgentInstructions decides the context needs retrieval.
  // Not part of the agent's own tool grants.
  retrievalMode?: boolean;
};

type AgentToolDefinitions = (
  ctx: AgentToolContext,
) => readonly ToolDefinition<z.ZodObject, unknown>[];

/** The tool definitions behind each agent tool id. Only granted ones are built. */
const agentToolDefinitions = {
  think: () => [thinkToolDefinition],
  webSearch: () => [webSearchToolDefinition],
  'google-drive': () => cloudDriveToolDefinitions('google-drive'),
} satisfies Partial<Record<AgentToolId, AgentToolDefinitions>>;

type DefinedAgentToolId = keyof typeof agentToolDefinitions;

function hasDefinitions(id: AgentToolId): id is DefinedAgentToolId {
  return Object.hasOwn(agentToolDefinitions, id);
}

// Migration: tools not yet converted to ToolDefinition. Each id lives in exactly one of the two records.
type ToolsetFactory = (writer: UIMessageStreamWriter, ctx: AgentToolContext) => ToolSet;

const toolsets = {
  webBrowser: (writer) => ({ webBrowser: getWebBrowserResults(writer) }),
  imageGen: (writer, ctx) => ({
    imageGen: getGeneratedImages(writer, ctx.userId, ctx.workspaceId, ctx.runsInWorker ?? false),
  }),
  videoGen: (writer, ctx) => ({
    videoGen: getGeneratedVideo(writer, ctx.userId, ctx.workspaceId, ctx.runsInWorker ?? false),
  }),
  linkedinDraft: (writer, ctx) => ({
    linkedinDraft: getLinkedinDraft(writer, ctx.userId, ctx.workspaceId),
  }),
  memory: (writer, ctx) => ({ memory: getMemoryTool(writer, ctx.agentId) }),
  datasets: (writer, ctx) => ({
    datasetCreate: getDatasetCreateTool(writer, ctx.userId, ctx.workspaceId),
    datasetFind: getDatasetFindTool(writer, ctx.userId, ctx.workspaceId),
    datasetListRows: getDatasetListRowsTool(writer, ctx.userId, ctx.workspaceId),
    datasetGetRow: getDatasetGetRowTool(writer, ctx.userId, ctx.workspaceId),
    datasetAppendRow: getDatasetAppendRowTool(writer, ctx.userId, ctx.workspaceId),
    datasetUpdateRow: getDatasetUpdateRowTool(writer, ctx.userId, ctx.workspaceId),
    datasetMoveRow: getDatasetMoveRowTool(writer, ctx.userId, ctx.workspaceId),
  }),
  documents: (writer, ctx) => ({
    listDocuments: getListDocumentsTool(writer, ctx.workspaceId),
    readDocument: getReadDocumentTool(writer, ctx.workspaceId),
    createDocument: getCreateDocumentTool(writer, ctx.workspaceId, ctx.agentId),
    editDocument: getEditDocumentTool(writer, ctx.workspaceId),
  }),
  tasks: (writer, ctx) => ({
    listTasks: getListTasksTool(writer, ctx.workspaceId),
    readTask: getReadTaskTool(writer, ctx.workspaceId),
    createTask: getCreateTaskTool(writer, ctx.workspaceId, ctx.agentId),
    updateTask: getUpdateTaskTool(writer, ctx.workspaceId),
    moveTask: getMoveTaskTool(writer, ctx.workspaceId),
  }),
} satisfies Record<Exclude<BuiltinAgentToolId, DefinedAgentToolId>, ToolsetFactory>;

/** `access` is set for grants of tools with access levels. */
function buildDefinedToolset(
  id: DefinedAgentToolId,
  access: ToolAccess | undefined,
  writer: UIMessageStreamWriter,
  ctx: AgentToolContext,
): ToolSet {
  const buildDefinitions: AgentToolDefinitions = agentToolDefinitions[id];
  const definitions = buildDefinitions(ctx);
  const allowed = access ? filterByAccess(definitions, access) : definitions;
  return toAgentTools(allowed, {
    toolContext: { userId: ctx.userId, workspaceId: ctx.workspaceId, origin: 'agent' },
    writer,
    logFields: { agentId: ctx.agentId },
  });
}

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

/**
 * Builds the `tools` record for an agent from its stored grants. Only granted
 * tools are built. Invalid stored grants are skipped and logged once.
 */
export function buildAgentToolset(
  storedGrants: readonly StoredAgentToolGrant[],
  writer: UIMessageStreamWriter,
  ctx: AgentToolContext,
): ToolSet {
  const entries = parseStoredGrants(storedGrants).flatMap((grant) => {
    const toolset = hasDefinitions(grant.id)
      ? buildDefinedToolset(grant.id, 'access' in grant ? grant.access : undefined, writer, ctx)
      : toolsets[grant.id](writer, ctx);
    return Object.entries(toolset);
  });
  const tools: ToolSet = Object.fromEntries(entries);

  if (ctx.retrievalMode) {
    tools.searchContextDocuments = getSearchContextDocumentsTool(writer, ctx.agentId);
  }

  return tools;
}
