import type { UIMessageStreamWriter } from '@repo/ai';

// Tool implementations only use their writer to emit transient UI events
// (chat "tool is running" chips). Workflow runs have no chat UI to stream
// to, so a no-op writer is enough to invoke them standalone. Used only by
// the agent executor (a workflow "agent" node runs with `@repo/ai`'s
// `tools()`, same as chat). The tool executor's workflow tools
// (`@repo/workflow`'s `workflowTools`) take no writer at all.
export const noopWriter = {
  write: () => {},
  merge: () => {},
  onError: undefined,
} as unknown as UIMessageStreamWriter;
