import { generateImagesSchema } from '@repo/ai';
import { userUpdateSchema } from '@repo/database';
import { workflowDefinitionSchema } from '@repo/workflow';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';
import { paginationSchema } from '../validation';

const primaryId = z.uuidv7();

export const validPaginationQuery = myzValidator('query', paginationSchema);

export const validUpdateUserProfileBody = myzValidator('json', userUpdateSchema);

export const validCreateChatBody = myzValidator(
  'json',
  z.object({
    agentId: primaryId.optional(),
  }),
);

export const validChatIdParam = myzValidator(
  'param',
  z.object({
    chatId: primaryId,
  }),
);

export const validUpsertAgentBody = myzValidator(
  'json',
  z.object({
    id: primaryId.nullish(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    aiModelId: primaryId,
    systemPrompt: z.string(),
    tools: z.array(z.string()),
    isDefault: z.boolean().optional(),
  }),
);

export const validAgentIdParam = myzValidator(
  'param',
  z.object({
    agentId: primaryId,
  }),
);

export const validGenerateImagesBody = myzValidator('json', generateImagesSchema);

export const validWorkflowIdParam = myzValidator(
  'param',
  z.object({
    workflowId: primaryId,
  }),
);

export const validUpsertWorkflowBody = myzValidator(
  'json',
  z.object({
    id: primaryId.nullish(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    definition: workflowDefinitionSchema,
  }),
);

export const validRunIdParam = myzValidator(
  'param',
  z.object({
    runId: primaryId,
  }),
);

export const validRunWorkflowBody = myzValidator(
  'json',
  z.object({
    input: z.string().optional(),
  }),
);

export const validSocialPostIdParam = myzValidator(
  'param',
  z.object({
    id: primaryId,
  }),
);

export const validUpdateSocialPostBody = myzValidator(
  'json',
  z.object({
    content: z.string().min(1).max(3000),
  }),
);
