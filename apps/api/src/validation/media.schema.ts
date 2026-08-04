import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

export const validMediaIdParam = myzValidator(
  'param',
  z.object({
    mediaId: z.uuidv7(),
  }),
);
