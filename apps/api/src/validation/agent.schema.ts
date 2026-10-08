import { agentSettingsSchema, agentToolsSchema } from '@repo/database';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validAgentIdParam = myzValidator(
  'param',
  z.object({
    agentId: primaryId,
  }),
);

export const validAgentMemoryBody = myzValidator(
  'json',
  z.object({
    content: z.string(),
  }),
);

// workspaceId comes from the path (validated by the workspace guard), never
// the body: a create can only ever land in the workspace it was posted to.
export const validCreateAgentBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    aiModelId: primaryId,
    systemPrompt: z.string(),
    context: z.string().max(30_000).nullish(),
    tools: agentToolsSchema,
    isDefault: z.boolean().optional(),
    defaultDatasetId: primaryId.nullish(),
    settings: agentSettingsSchema,
  }),
);

// PATCH: every field is optional, only the ones sent are updated. Splits the
// old upsert endpoint's update half.
export const validUpdateAgentBody = myzValidator(
  'json',
  z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    aiModelId: primaryId.optional(),
    systemPrompt: z.string().optional(),
    context: z.string().max(30_000).nullish(),
    tools: agentToolsSchema,
    isDefault: z.boolean().optional(),
    defaultDatasetId: primaryId.nullish(),
    settings: agentSettingsSchema,
  }),
);
