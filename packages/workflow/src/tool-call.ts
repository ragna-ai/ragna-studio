// A single tool invocation captured while executing an agent node that runs
// a referenced agent (see apps/worker/src/workflow/executors/agent.executor.ts).
// Persisted once, together with the completed step row: there is no live,
// per-call update while the node is still running.
export type WorkflowToolCall = {
  toolName: string;
  input: unknown;
  output: unknown;
  error?: string;
};
