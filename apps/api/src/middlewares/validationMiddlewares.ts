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
    assistantId: primaryId.optional(),
  }),
);

export const validChatIdParam = myzValidator(
  'param',
  z.object({
    chatId: primaryId,
  }),
);
