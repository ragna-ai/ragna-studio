import {
  toAgentTools,
  ToolExecutionError,
  type ToolDefinition,
  type UIMessageStreamWriter,
} from '@repo/ai';
import { describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { stubToolExecutionOptions } from '../stub-tool-execution-options';

type UIMessageChunk = Parameters<UIMessageStreamWriter['write']>[0];

const INTERNAL_ERROR_TEXT = 'relation "internal_table" does not exist';

const echoInputSchema = z.object({ text: z.string() });

const failingDefinition: ToolDefinition<typeof echoInputSchema, never> = {
  name: 'failingTool',
  description: 'Always throws.',
  inputSchema: echoInputSchema,
  access: 'read',
  execute: async () => {
    throw new Error(INTERNAL_ERROR_TEXT);
  },
};

const announcingDefinition: ToolDefinition<typeof echoInputSchema, { text: string }> = {
  name: 'announcingTool',
  description: 'Echoes its input and announces the call.',
  inputSchema: echoInputSchema,
  access: 'read',
  uiEvent: ({ text }) => ({ type: 'data-announcing', data: { text } }),
  execute: async ({ text }) => ({ text }),
};

const toolContext = { userId: 'user-1', workspaceId: 'workspace-1', origin: 'agent' as const };

function recordingWriter(chunks: UIMessageChunk[]): UIMessageStreamWriter {
  return {
    write: (chunk) => {
      chunks.push(chunk);
    },
    merge: () => {},
    onError: undefined,
  };
}

function executeOf(tools: ReturnType<typeof toAgentTools>, name: string) {
  const execute = tools[name]?.execute;
  if (!execute) throw new Error(`${name} has no execute`);
  return execute;
}

describe('tool runner', () => {
  test('a tool that throws fails with a generic message that names the tool', async () => {
    const tools = toAgentTools([failingDefinition], { toolContext });
    const call = executeOf(tools, 'failingTool')({ text: 'hi' }, stubToolExecutionOptions);

    await expect(call).rejects.toBeInstanceOf(ToolExecutionError);
    await expect(call).rejects.toThrow('failingTool');
  });

  test("a thrown error's own text does not reach the caller", async () => {
    const tools = toAgentTools([failingDefinition], { toolContext });
    const error = await Promise.resolve(
      executeOf(tools, 'failingTool')({ text: 'hi' }, stubToolExecutionOptions),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(INTERNAL_ERROR_TEXT);
  });

  test('a tool with a UI event announces the call as a transient data part', async () => {
    const chunks: UIMessageChunk[] = [];
    const tools = toAgentTools([announcingDefinition], {
      toolContext,
      writer: recordingWriter(chunks),
    });

    const output = await executeOf(tools, 'announcingTool')(
      { text: 'hi' },
      stubToolExecutionOptions,
    );

    expect(output).toEqual({ text: 'hi' });
    expect(chunks).toEqual([{ type: 'data-announcing', data: { text: 'hi' }, transient: true }]);
  });

  test('a tool with a UI event runs without a writer', async () => {
    const tools = toAgentTools([announcingDefinition], { toolContext });

    const output = await executeOf(tools, 'announcingTool')(
      { text: 'hi' },
      stubToolExecutionOptions,
    );

    expect(output).toEqual({ text: 'hi' });
  });
});
