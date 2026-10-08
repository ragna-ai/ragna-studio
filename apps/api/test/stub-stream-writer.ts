import type { getUpdateTaskTool } from '@repo/ai';

type StreamWriter = Parameters<typeof getUpdateTaskTool>[0];

/** Discards everything the tools stream to the UI. */
export const stubStreamWriter: StreamWriter = {
  write() {},
  merge() {},
  onError: undefined,
};
