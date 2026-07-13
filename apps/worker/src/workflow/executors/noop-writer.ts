import type { UIMessageStreamWriter } from 'ai';

// Tool implementations only use their writer to emit transient UI events
// (chat "tool is running" chips). Workflow runs have no chat UI to stream
// to, so a no-op writer is enough to invoke them standalone. Shared by the
// tool and agent executors, both of which call into `@repo/ai`'s `tools()`.
export const noopWriter = {
  write: () => {},
  merge: () => {},
  onError: undefined,
} as unknown as UIMessageStreamWriter;
