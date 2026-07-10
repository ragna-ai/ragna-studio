import { userUpdateSchema } from '@repo/database';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';
import { paginationSchema } from '../validation';

const primaryId = z.uuid();

export const validPaginationQuery = myzValidator('query', paginationSchema);

export const validUpdateUserProfileBody = myzValidator('json', userUpdateSchema);

export const validChatIdParam = myzValidator(
  'param',
  z.object({
    chatId: primaryId,
  }),
);
