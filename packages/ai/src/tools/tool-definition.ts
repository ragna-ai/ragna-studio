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

/** A transient chat data part announcing a tool call, for UI that reacts before the result. */
export interface ToolUiEvent {
  type: `data-${string}`;
  data: unknown;
}

export interface ToolDefinition<Schema extends z.ZodObject, Output> {
  name: string;
  description: string;
  inputSchema: Schema;
  access: ToolAccess;
  annotations?: ToolAnnotations;
  // Method syntax: bivariant params let differently-schemaed definitions share one list type.
  uiEvent?(input: z.infer<Schema>): ToolUiEvent;
  execute(input: z.infer<Schema>, ctx: ToolContext): Promise<Output>;
}

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

/** Runs one tool call. Logs a thrown error and replaces it with a `ToolExecutionError`. */
export async function executeTool<Schema extends z.ZodObject, Output>(
  definition: ToolDefinition<Schema, Output>,
  input: z.infer<Schema>,
  ctx: ToolContext,
  logFields: ToolLogFields = {},
): Promise<Output> {
  try {
    return await definition.execute(input, ctx);
  } catch (error) {
    logger.error(`Tool ${definition.name} failed`, {
      tool: definition.name,
      origin: ctx.origin,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      ...logFields,
      error,
    });
    throw new ToolExecutionError(definition.name);
  }
}

export interface AgentToolsOptions {
  toolContext: ToolContext;
  /** Receives each definition's `uiEvent`. Absent where no chat UI listens, e.g. workflows. */
  writer?: UIMessageStreamWriter;
  logFields?: ToolLogFields;
}

/** The AI SDK adapter: one AI SDK tool per definition, run through `executeTool`. */
export function toAgentTools(
  definitions: readonly ToolDefinition<z.ZodObject, unknown>[],
  { toolContext, writer, logFields }: AgentToolsOptions,
): ToolSet {
  const entries = definitions.map((definition): [string, ToolSet[string]] => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
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
