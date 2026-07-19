import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validNotificationIdParam = myzValidator(
  'param',
  z.object({
    id: primaryId,
  }),
);
