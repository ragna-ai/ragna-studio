import type { ToolConfig } from '@repo/workflow';
import { resolveTemplate, workflowTools } from '@repo/workflow';
import type { Executor } from './types';

export const executeTool: Executor = async (node, ctx) => {
  const config = node.data.config as ToolConfig;
  const input = resolveTemplate(config.input, ctx);

  const result = await workflowTools[config.tool](input, {
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  return { output: typeof result === 'string' ? result : JSON.stringify(result) };
};
