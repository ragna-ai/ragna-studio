import type { AgentTool } from '@repo/database';
import type { ToolSet, UIMessageStreamWriter } from 'ai';
import { getSearchContextDocumentsTool } from './agent-context.tool';
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

export type AgentToolContext = {
  userId: string;
  agentId: string;
  workspaceId: string;
  // Chat wiring passes false (or omits it): the tool enqueues and returns a
  // pending id. Workflow executors (team.executor.ts,
  // run-referenced-agent.ts) pass true: they already run inside the worker
  // and need the finished video for downstream steps, so the tool awaits
  // runGenVideo inline instead (docs/videogen/prd.md decision 2).
  awaitGeneration?: boolean;
  // Wired automatically when buildAgentInstructions decides the agent's
  // context needs retrieval, not part of the agent's own tool checklist
  // (docs/agent/agent-context-retrieval.md, "Search tool").
  retrievalMode?: boolean;
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
  videoGen: (writer, ctx) => ({
    videoGen: getGeneratedVideo(writer, ctx.userId, ctx.workspaceId, ctx.awaitGeneration ?? false),
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
  const tools: ToolSet = Object.fromEntries(toolEntries);

  if (ctx.retrievalMode) {
    tools.searchContextDocuments = getSearchContextDocumentsTool(writer, ctx.agentId);
  }

  return tools;
}
