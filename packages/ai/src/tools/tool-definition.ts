import { logger } from '@repo/logger';
import type { ToolSet, UIMessageStreamWriter } from 'ai';
import { tool } from 'ai';
import * as z from 'zod';
import type { ToolAccess } from './agent-tool-catalog';

export type { ToolAccess };
export type ToolOrigin = 'agent' | 'mcp';

export interface ToolContext {
  userId: string;
  workspaceId: string;
  origin: ToolOrigin;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

/** An expected outcome the model can act on, returned instead of the tool's normal output. */
export interface ToolFailure<Status extends string = string> {
  status: Status;
  /** Short, model-facing and actionable. Never contains a token or internal error text. */
  message: string;
}

/**
 * Recognizes a `ToolFailure` in a tool's output. Strict, so a success output that happens to carry
 * a `status` field is never taken for a failure.
 */
export const toolFailureSchema = z.strictObject({ status: z.string(), message: z.string() });

/** A transient chat data part announcing a tool call, for UI that reacts before the result. */
export interface ToolUiEvent {
  type: `data-${string}`;
  data: unknown;
}

/** What a tool's `execute` returns: its declared output, or an expected failure. */
export type ToolOutput<OutputSchema extends z.ZodObject, FailureStatus extends string = never> =
  | z.infer<OutputSchema>
  | ToolFailure<FailureStatus>;

export interface ToolDefinition<
  InputSchema extends z.ZodObject,
  OutputSchema extends z.ZodObject,
  FailureStatus extends string = never,
> {
  name: string;
  description: string;
  inputSchema: InputSchema;
  /** The shape of a successful output. JSON types only: MCP advertises it as JSON Schema. */
  outputSchema: OutputSchema;
  access: ToolAccess;
  annotations?: ToolAnnotations;
  // Method syntax: bivariant params let differently-schemaed definitions share one list type.
  uiEvent?(input: z.infer<InputSchema>): ToolUiEvent;
  execute(
    input: z.infer<InputSchema>,
    ctx: ToolContext,
  ): Promise<ToolOutput<OutputSchema, FailureStatus>>;
}

/** Any tool definition, for lists and adapters that don't need the precise types. */
export type AnyToolDefinition = ToolDefinition<z.ZodObject, z.ZodObject, string>;

/** Fields that identify the caller in the log line of a failed call, e.g. `agentId`. */
export type ToolLogFields = Readonly<Record<string, string>>;

/** Thrown in place of any error a tool's `execute` throws, so its text never reaches a client. */
export class ToolExecutionError extends Error {
  constructor(toolName: string) {
    super(`The ${toolName} tool failed unexpectedly. Continue without it or try again later.`);
    this.name = 'ToolExecutionError';
  }
}

/** `read` keeps read definitions, `write` keeps all. */
export function filterByAccess<Definition extends { access: ToolAccess }>(
  definitions: readonly Definition[],
  access: ToolAccess,
): Definition[] {
  return definitions.filter((definition) => access === 'write' || definition.access === 'read');
}

/**
 * Runs one tool call and returns its output parsed against the declared schema (or a failure).
 * Logs a thrown error or a schema mismatch and replaces it with a `ToolExecutionError`.
 */
export async function executeTool<
  InputSchema extends z.ZodObject,
  OutputSchema extends z.ZodObject,
  FailureStatus extends string,
>(
  definition: ToolDefinition<InputSchema, OutputSchema, FailureStatus>,
  input: z.infer<InputSchema>,
  ctx: ToolContext,
  logFields: ToolLogFields = {},
): Promise<ToolOutput<OutputSchema, FailureStatus>> {
  const logFailure = (error: unknown) =>
    logger.error(`Tool ${definition.name} failed`, {
      tool: definition.name,
      origin: ctx.origin,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      ...logFields,
      error,
    });

  let output: ToolOutput<OutputSchema, FailureStatus>;
  try {
    output = await definition.execute(input, ctx);
  } catch (error) {
    logFailure(error);
    throw new ToolExecutionError(definition.name);
  }

  const parsed = definition.outputSchema.or(toolFailureSchema).safeParse(output);
  if (!parsed.success) {
    logFailure(parsed.error.issues);
    throw new ToolExecutionError(definition.name);
  }
  // The parsed value is the declared output or a failure, as `execute` promised.
  return parsed.data as ToolOutput<OutputSchema, FailureStatus>;
}

export interface AgentToolsOptions {
  toolContext: ToolContext;
  /** Receives each definition's `uiEvent`. Absent where no chat UI listens, e.g. workflows. */
  writer?: UIMessageStreamWriter;
  logFields?: ToolLogFields;
}

/** The AI SDK adapter: one AI SDK tool per definition, run through `executeTool`. */
export function toAgentTools(
  definitions: readonly AnyToolDefinition[],
  { toolContext, writer, logFields }: AgentToolsOptions,
): ToolSet {
  const entries = definitions.map((definition): [string, ToolSet[string]] => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema.or(toolFailureSchema),
      execute: (input) => {
        const event = definition.uiEvent?.(input);
        if (event && writer) {
          writer.write({ type: event.type, data: event.data, transient: true });
        }
        return executeTool(definition, input, toolContext, logFields);
      },
    }),
  ]);
  return Object.fromEntries(entries);
}
