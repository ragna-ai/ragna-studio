import {
  toAgentTools,
  ToolExecutionError,
  type AnyToolDefinition,
  type ToolDefinition,
  type UIMessageStreamWriter,
} from '@repo/ai';
import { describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { stubToolExecutionOptions } from '../stub-tool-execution-options';

type UIMessageChunk = Parameters<UIMessageStreamWriter['write']>[0];

const INTERNAL_ERROR_TEXT = 'relation "internal_table" does not exist';

const echoInputSchema = z.object({ text: z.string() });

const echoOutputSchema = z.strictObject({ text: z.string() });

const failingDefinition: ToolDefinition<typeof echoInputSchema, typeof echoOutputSchema> = {
  name: 'failingTool',
  description: 'Always throws.',
  inputSchema: echoInputSchema,
  outputSchema: echoOutputSchema,
  access: 'read',
  execute: async () => {
    throw new Error(INTERNAL_ERROR_TEXT);
  },
};

const announcingDefinition: ToolDefinition<typeof echoInputSchema, typeof echoOutputSchema> = {
  name: 'announcingTool',
  description: 'Echoes its input and announces the call.',
  inputSchema: echoInputSchema,
  outputSchema: echoOutputSchema,
  access: 'read',
  uiEvent: ({ text }) => ({ type: 'data-announcing', data: { text } }),
  execute: async ({ text }) => ({ text }),
};

const LEAKED_FIELD_VALUE = 'secret-value';

const statusOutputSchema = z.object({ status: z.literal('ok'), text: z.string() });

function definitionReturning(
  output: Record<string, unknown>,
  outputSchema: z.ZodObject = echoOutputSchema,
): AnyToolDefinition {
  return {
    name: 'returningTool',
    description: 'Returns a fixed output.',
    inputSchema: echoInputSchema,
    outputSchema,
    access: 'read',
    execute: async () => output,
  };
}

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

  test('an output that matches the declared shape is returned unchanged', async () => {
    const tools = toAgentTools([definitionReturning({ text: 'hi' })], { toolContext });

    const output = await executeOf(tools, 'returningTool')(
      { text: 'hi' },
      stubToolExecutionOptions,
    );

    expect(output).toEqual({ text: 'hi' });
  });

  test('an output with an extra field fails and does not leak the field', async () => {
    const tools = toAgentTools([definitionReturning({ text: 'hi', leaked: LEAKED_FIELD_VALUE })], {
      toolContext,
    });
    const call = Promise.resolve(
      executeOf(tools, 'returningTool')({ text: 'hi' }, stubToolExecutionOptions),
    );

    await expect(call).rejects.toBeInstanceOf(ToolExecutionError);
    const error = await call.catch((caught: unknown) => caught);
    expect(String(error)).not.toContain(LEAKED_FIELD_VALUE);
  });

  test('an output with a wrong-typed field fails', async () => {
    const tools = toAgentTools([definitionReturning({ text: 42 })], { toolContext });
    const call = Promise.resolve(
      executeOf(tools, 'returningTool')({ text: 'hi' }, stubToolExecutionOptions),
    );

    await expect(call).rejects.toBeInstanceOf(ToolExecutionError);
  });

  test('an expected failure passes through as the output', async () => {
    const failure = { status: 'not_found', message: 'Nothing here.' };
    const tools = toAgentTools([definitionReturning(failure)], { toolContext });

    const output = await executeOf(tools, 'returningTool')(
      { text: 'hi' },
      stubToolExecutionOptions,
    );

    expect(output).toEqual(failure);
  });

  test('a success output that carries a status field is not taken for a failure', async () => {
    const success = { status: 'ok', text: 'hi' };
    const tools = toAgentTools([definitionReturning(success, statusOutputSchema)], {
      toolContext,
    });

    const output = await executeOf(tools, 'returningTool')(
      { text: 'hi' },
      stubToolExecutionOptions,
    );

    expect(output).toEqual(success);
  });

  test('a failure with an extra field is rejected', async () => {
    const tools = toAgentTools(
      [definitionReturning({ status: 'not_found', message: 'Nothing here.', leaked: 'x' })],
      { toolContext },
    );
    const call = Promise.resolve(
      executeOf(tools, 'returningTool')({ text: 'hi' }, stubToolExecutionOptions),
    );

    await expect(call).rejects.toBeInstanceOf(ToolExecutionError);
  });
});
