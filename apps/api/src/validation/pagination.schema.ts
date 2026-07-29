import { safeParseInt } from '@repo/utils';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

export const paginationSchema = z.object({
  page: z
    .string()
    .transform((val) => safeParseInt(val) ?? 1)
    .refine((val) => val && val > 0, {
      message: 'Page must be greater than 0',
    })
    .optional()
    .default(1),
  limit: z
    .string()
    .transform((val) => safeParseInt(val) ?? 10)
    .refine((val) => val && val > 0, {
      message: 'Limit must be greater than 0',
    })
    .optional()
    .default(10),
  sort: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const validPaginationQuery = myzValidator('query', paginationSchema);
