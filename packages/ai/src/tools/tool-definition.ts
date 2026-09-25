import * as z from 'zod';

export type ToolAccess = 'read' | 'write';
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
