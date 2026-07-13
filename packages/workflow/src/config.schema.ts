import { z } from 'zod';

// Trigger keeps a `kind` discriminator so cron/webhook can be added later
// without a schema migration. Manual is the only kind supported in v1.
export const triggerConfigSchema = z.object({
  kind: z.literal('manual'),
});
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

export const agentConfigSchema = z.object({
  agentId: z.string().optional(),
  systemPrompt: z.string().optional(),
  prompt: z.string().min(1),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const WORKFLOW_TOOLS = ['think', 'webSearch', 'webBrowser', 'imageGen'] as const;
export type WorkflowTool = (typeof WORKFLOW_TOOLS)[number];

export const toolConfigSchema = z.object({
  tool: z.enum(WORKFLOW_TOOLS),
  input: z.string(),
});
export type ToolConfig = z.infer<typeof toolConfigSchema>;

export const CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'isEmpty',
  'isNotEmpty',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const conditionConfigSchema = z.object({
  left: z.string(),
  operator: z.enum(CONDITION_OPERATORS),
  right: z.string().optional(),
});
export type ConditionConfig = z.infer<typeof conditionConfigSchema>;

export const transformConfigSchema = z.object({
  template: z.string(),
});
export type TransformConfig = z.infer<typeof transformConfigSchema>;
