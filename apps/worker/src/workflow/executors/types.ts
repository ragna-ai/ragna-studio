import type { WorkflowNode } from '@repo/workflow';

// Shared with @repo/workflow's resolveTemplate ctx shape, plus the
// executing user so node executors can look up user-owned rows (agents).
export type ExecutorContext = {
  input: string;
  nodes: Record<string, string>;
  userId: string;
};

export type Executor = (node: WorkflowNode, ctx: ExecutorContext) => Promise<string>;
