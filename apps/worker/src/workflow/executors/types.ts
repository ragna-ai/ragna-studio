import type { WorkflowAgentTraceStep, WorkflowNode } from '@repo/workflow';

// Shared with @repo/workflow's resolveTemplate ctx shape, plus the
// executing user so node executors can look up user-owned rows (agents).
export type ExecutorContext = {
  input: string;
  userId: string;
  workspaceId: string;
  // The workflow run this node belongs to. Combined with the node's own id
  // (available to every Executor as its first argument), this is what makes
  // a credit charge's idempotencyKey stable across a BullMQ retry of the
  // same run (specs/credits/prd.md, "Call sites").
  runId: string;
};

// `trace` is only ever set by executors that run a referenced agent's tool
// loop (the agent node's agentId path, the team node); every other executor
// returns just an output.
export type ExecutorResult = {
  output: string;
  trace?: WorkflowAgentTraceStep[];
};

export type Executor = (node: WorkflowNode, ctx: ExecutorContext) => Promise<ExecutorResult>;
