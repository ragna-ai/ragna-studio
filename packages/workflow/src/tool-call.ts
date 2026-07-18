export type WorkflowTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

// A single tool invocation captured while executing an agent node that runs
// a referenced agent (see apps/worker/src/workflow/executors/agent.executor.ts).
// Persisted once, together with the completed step row: there is no live,
// per-call update while the node is still running.
export type WorkflowToolCall = {
  toolName: string;
  input: unknown;
  output: unknown;
  error?: string;
  // Set only for a team node's delegate calls: the member's own tool calls.
  calls?: WorkflowToolCall[];
  // Set only for a team node's delegate calls: how long the member run took.
  durationMs?: number;
  // Set only for a team node's delegate calls: the member run's total usage.
  usage?: WorkflowTokenUsage;
};

// One entry per AI SDK step of the node's own agent loop: the step's
// commentary (why it delegated, how it judged a report), its token usage,
// and the tool calls it made. Replaces the older flat toolCalls capture so
// the run view can render a timeline instead of just a final call list.
export type WorkflowAgentTraceStep = {
  text?: string;
  usage?: WorkflowTokenUsage;
  toolCalls: WorkflowToolCall[];
};
