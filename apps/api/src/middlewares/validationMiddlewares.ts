import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';
import { paginationSchema } from '../validation';

const cuid = z.cuid2();

export const validPaginationQuery = myzValidator('query', paginationSchema);

// export const validUpdateUserProfileJson = myzValidator('json', updateUserSchema);

export const validChatIdParam = myzValidator(
  'param',
  z.object({
    chatId: cuid,
  }),
);
