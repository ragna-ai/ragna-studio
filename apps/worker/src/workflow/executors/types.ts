import type { WorkflowNode, WorkflowToolCall } from '@repo/workflow';

// Shared with @repo/workflow's resolveTemplate ctx shape, plus the
// executing user so node executors can look up user-owned rows (agents).
export type ExecutorContext = {
  input: string;
  userId: string;
  workspaceId: string | null;
};

// `toolCalls` is only ever set by the agent executor's agentId path (an
// agent running with tools); every other executor returns just an output.
export type ExecutorResult = {
  output: string;
  toolCalls?: WorkflowToolCall[];
};

export type Executor = (node: WorkflowNode, ctx: ExecutorContext) => Promise<ExecutorResult>;
