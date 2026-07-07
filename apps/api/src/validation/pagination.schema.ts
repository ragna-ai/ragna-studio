import { safeParseInt } from '@repo/utils';
import * as z from 'zod';

export const paginationSchema = z.object({
  page: z
    .string()
    .transform((val) => safeParseInt(val))
    .refine((val) => val && val > 0, {
      message: 'Page must be greater than 0',
    })
    .optional(),
  limit: z
    .string()
    .transform((val) => safeParseInt(val))
    .refine((val) => val && val > 0, {
      message: 'Limit must be greater than 0',
    })
    .optional(),
  sort: z.enum(['asc', 'desc']).optional(),
});
