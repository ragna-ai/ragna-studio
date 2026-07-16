import type { WorkflowTool } from '../config.schema';
import type { WorkflowToolContext } from './workflow-tool-context';

// A mapped type keyed by WorkflowTool: if WORKFLOW_TOOLS (config.schema.ts)
// ever gains or loses an entry, this type - and the object literal below -
// fails to typecheck until the implementation catches up.
type WorkflowTools = {
  [K in WorkflowTool]: (input: string, ctx: WorkflowToolContext) => Promise<unknown>;
};

export const workflowTools: WorkflowTools = {
  placeholder: async (input: string, ctx: WorkflowToolContext) => {
    // Placeholder for future tools
    console.log(`Placeholder tool called with input: ${input}, userId: ${ctx.userId}, workspaceId: ${ctx.workspaceId}`);
    return { message: 'This is a placeholder tool. No action taken.' };
  }
};
