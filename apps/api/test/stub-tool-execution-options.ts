import type { ToolSet } from '@repo/ai';

type ToolExecute = NonNullable<ToolSet[string]['execute']>;

/** Minimal options for calling an AI SDK tool's `execute` directly. */
export const stubToolExecutionOptions: Parameters<ToolExecute>[1] = {
  toolCallId: 'call-1',
  messages: [],
  context: undefined,
};
