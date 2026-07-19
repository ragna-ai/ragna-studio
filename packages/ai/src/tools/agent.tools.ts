import type { AgentTool } from '@repo/database';
import type { ToolSet, UIMessageStreamWriter } from 'ai';
import {
  getDatasetAppendRowTool,
  getDatasetCreateTool,
  getDatasetFindTool,
  getDatasetGetRowTool,
  getDatasetListRowsTool,
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
import { getThoughts } from './think.tool';
import { getWebBrowserResults } from './web-browser.tool';
import { getWebSearchResults } from './web-search.tool';

export type AgentToolContext = {
  userId: string;
  agentId: string;
  workspaceId: string;
};

type ToolsetFactory = (writer: UIMessageStreamWriter, ctx: AgentToolContext) => ToolSet;

// One toolset per stored agent-tool id (AgentTool, agent.schema.ts). Most
// ids map to a single tool; `datasets` is a family behind one toggle
// (docs/datasets.md decision 4). The AI SDK has no grouping concept of its
// own: a ToolSet is just a record, so composition happens here and only the
// enabled tools are ever constructed or sent to the model.
const toolsets: Record<AgentTool, ToolsetFactory> = {
  think: (writer) => ({ think: getThoughts(writer) }),
  webSearch: (writer) => ({ webSearch: getWebSearchResults(writer) }),
  webBrowser: (writer) => ({ webBrowser: getWebBrowserResults(writer) }),
  imageGen: (writer, ctx) => ({
    imageGen: getGeneratedImages(writer, ctx.userId, ctx.workspaceId),
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
  }),
  documents: (writer, ctx) => ({
    listDocuments: getListDocumentsTool(writer, ctx.workspaceId),
    readDocument: getReadDocumentTool(writer, ctx.workspaceId),
    createDocument: getCreateDocumentTool(writer, ctx.workspaceId, ctx.agentId),
    editDocument: getEditDocumentTool(writer, ctx.workspaceId),
  }),
};

/**
 * Builds the `tools` record for an agent from its enabled tool ids.
 * Replaces the former all-tools-plus-`activeTools` filtering: a tool that
 * isn't enabled isn't built at all. Ids not in the registry (stale jsonb
 * values) are skipped.
 */
export function buildAgentToolset(
  enabledTools: readonly AgentTool[],
  writer: UIMessageStreamWriter,
  ctx: AgentToolContext,
): ToolSet {
  const toolEntries = enabledTools.flatMap((toolId) => {
    const factory = toolsets[toolId];
    return factory ? Object.entries(factory(writer, ctx)) : [];
  });
  return Object.fromEntries(toolEntries);
}
