import type { getUpdateTaskTool } from '@repo/ai';

type StreamWriter = Parameters<typeof getUpdateTaskTool>[0];

/** Discards everything the tools stream to the UI. */
export const stubStreamWriter: StreamWriter = {
  write() {},
  merge() {},
  onError: undefined,
};

type ToolExecute = NonNullable<ReturnType<typeof getUpdateTaskTool>['execute']>;

/** Minimal options for calling a tool's `execute` directly. */
export const stubToolExecutionOptions: Parameters<ToolExecute>[1] = {
  toolCallId: 'call-1',
  messages: [],
  context: undefined,
};
