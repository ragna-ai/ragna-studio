import type { StoredAgentToolGrant } from '@repo/database/schema';
import { logger } from '@repo/logger';
import type { ToolSet, UIMessageStreamWriter } from 'ai';
import { getSearchContextDocumentsTool } from './agent-context.tool';
import {
  agentToolGrantSchema,
  type AgentToolGrant,
  type BuiltinAgentToolId,
  type IntegrationAgentToolId,
} from './agent-tool-catalog';
import { getCloudDriveTools } from './cloud-drive.tools';
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
import { getThoughts } from './think.tool';
import { getGeneratedVideo } from './video-gen.tool';
import { getWebBrowserResults } from './web-browser.tool';
import { getWebSearchResults } from './web-search.tool';
import type { ToolAccess } from './tool-definition';

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

type ToolsetFactory = (writer: UIMessageStreamWriter, ctx: AgentToolContext) => ToolSet;
type AccessToolsetFactory = (
  writer: UIMessageStreamWriter,
  ctx: AgentToolContext,
  access: ToolAccess,
) => ToolSet;

// A ToolSet is just a record, so tools are grouped here and only granted
// ones are ever constructed or sent to the model.
const toolsets = {
  think: (writer) => ({ think: getThoughts(writer) }),
  webSearch: (writer) => ({ webSearch: getWebSearchResults(writer) }),
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
} satisfies Record<BuiltinAgentToolId, ToolsetFactory>;

const accessToolsets = {
  'google-drive': (_writer, ctx, access) =>
    getCloudDriveTools({
      integrationId: 'google-drive',
      access,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
    }),
} satisfies Record<IntegrationAgentToolId, AccessToolsetFactory>;

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
    const toolset =
      'access' in grant
        ? accessToolsets[grant.id](writer, ctx, grant.access)
        : toolsets[grant.id](writer, ctx);
    return Object.entries(toolset);
  });
  const tools: ToolSet = Object.fromEntries(entries);

  if (ctx.retrievalMode) {
    tools.searchContextDocuments = getSearchContextDocumentsTool(writer, ctx.agentId);
  }

  return tools;
}
