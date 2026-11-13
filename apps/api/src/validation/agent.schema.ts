import {
  AGENT_CONTEXT_MAX_LENGTH,
  AGENT_INSTRUCTIONS_MAX_LENGTH,
  agentMarkIconSchema,
  agentMarkToneSchema,
  agentToolGrantsSchema,
} from '@repo/ai';
import { agentSettingsSchema } from '@repo/database';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validAgentIdParam = myzValidator(
  'param',
  z.object({
    agentId: primaryId,
  }),
);

export const validAgentFromTemplateBody = myzValidator(
  'json',
  z.object({
    templateId: primaryId,
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
  z.strictObject({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    aiModelId: primaryId,
    systemPrompt: z.string().max(AGENT_INSTRUCTIONS_MAX_LENGTH),
    context: z.string().max(AGENT_CONTEXT_MAX_LENGTH).nullish(),
    toolGrants: agentToolGrantsSchema.optional(),
    defaultDatasetId: primaryId.nullish(),
    icon: agentMarkIconSchema.nullish(),
    tone: agentMarkToneSchema.nullish(),
    imageMediaId: primaryId.nullish(),
    settings: agentSettingsSchema,
  }),
);

// PATCH: every field is optional, only the ones sent are updated. Splits the
// old upsert endpoint's update half.
export const validUpdateAgentBody = myzValidator(
  'json',
  z
    .strictObject({
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      aiModelId: primaryId.optional(),
      systemPrompt: z.string().max(AGENT_INSTRUCTIONS_MAX_LENGTH).optional(),
      context: z.string().max(AGENT_CONTEXT_MAX_LENGTH).nullish(),
      toolGrants: agentToolGrantsSchema.optional(),
      defaultDatasetId: primaryId.nullish(),
      icon: agentMarkIconSchema.nullish(),
      tone: agentMarkToneSchema.nullish(),
      imageMediaId: primaryId.nullish(),
      settings: agentSettingsSchema,
    })
    .refine((body) => Object.values(body).some((value) => value !== undefined), {
      message: 'At least one field to update is required',
    }),
);
