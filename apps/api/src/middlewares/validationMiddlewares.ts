import { generateImagesSchema } from '@repo/ai';
import { userUpdateSchema } from '@repo/database';
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
