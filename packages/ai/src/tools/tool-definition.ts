import type { ToolSet } from 'ai';
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

export interface ToolDefinition<Schema extends z.ZodObject, Output> {
  name: string;
  description: string;
  inputSchema: Schema;
  access: ToolAccess;
  annotations?: ToolAnnotations;
  // Method syntax: bivariant params let differently-schemaed definitions share one list type.
  execute(input: z.infer<Schema>, ctx: ToolContext): Promise<Output>;
}

/** AI SDK tools for the definitions a grant allows: `read` keeps read tools, `write` keeps all. */
export function toAgentTools(
  definitions: readonly ToolDefinition<z.ZodObject, unknown>[],
  access: ToolAccess,
  toolContext: ToolContext,
): ToolSet {
  const allowed = definitions.filter(
    (definition) => access === 'write' || definition.access === 'read',
  );
  const entries = allowed.map((definition): [string, ToolSet[string]] => [
    definition.name,
    tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: (input) => definition.execute(input, toolContext),
    }),
  ]);
  return Object.fromEntries(entries);
}
