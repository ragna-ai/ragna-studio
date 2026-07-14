import { tools as buildAgentTools } from '@repo/ai';
import type { ToolConfig, WorkflowTool } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import { noopWriter } from './noop-writer';
import type { Executor } from './types';

// Required by the ai SDK's ToolExecuteFunction signature, but unused by any
// of our tool implementations (they don't read toolCallId/messages/context).
const toolCallOptions = { toolCallId: 'workflow-tool-call', messages: [] } as any;

function buildToolInput(tool: WorkflowTool, input: string) {
  switch (tool) {
    case 'think':
      return { thought: input };
    case 'webSearch':
      return { query: input };
    case 'webBrowser':
      return { url: input };
    case 'imageGen':
      return { prompt: input };
    case 'linkedinDraft':
      // No draftId in workflow context: a tool node always creates a new draft.
      return { text: input };
  }
}

export const executeTool: Executor = async (node, ctx) => {
  const config = node.data.config as ToolConfig;
  const input = resolveTemplate(config.input, ctx);

  const toolset = buildAgentTools(noopWriter, { userId: ctx.userId });
  const tool = toolset[config.tool];

  if (!tool.execute) {
    throw new Error(`Tool "${config.tool}" has no execute function`);
  }

  const result = await tool.execute(buildToolInput(config.tool, input) as any, toolCallOptions);

  return { output: typeof result === 'string' ? result : JSON.stringify(result) };
};
