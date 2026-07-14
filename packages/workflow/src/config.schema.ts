import { z } from 'zod';
import { isValidCronExpression } from './cron';

// Trigger keeps a `kind` discriminator so further kinds (e.g. webhook) can be
// added later without a schema migration: the definition lives in jsonb.
const manualTriggerConfigSchema = z.object({
  kind: z.literal('manual'),
});

const scheduleTriggerConfigSchema = z.object({
  kind: z.literal('schedule'),
  // 5-field (minute granularity) cron expression, no seconds field.
  cron: z.string().refine(isValidCronExpression, { message: 'Invalid cron expression' }),
  // Required IANA name (e.g. `Europe/Berlin`) so the schedule has no
  // server-local-time ambiguity. The web form defaults it to the browser timezone.
  timezone: z.string().refine((timezone) => Intl.supportedValuesOf('timeZone').includes(timezone), {
    message: 'Invalid timezone',
  }),
});

export const triggerConfigSchema = z.discriminatedUnion('kind', [
  manualTriggerConfigSchema,
  scheduleTriggerConfigSchema,
]);
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

export const agentConfigSchema = z.object({
  agentId: z.string().optional(),
  systemPrompt: z.string().optional(),
  prompt: z.string().min(1),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const WORKFLOW_TOOLS = [
  'think',
  'webSearch',
  'webBrowser',
  'imageGen',
  'linkedinDraft',
] as const;
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
