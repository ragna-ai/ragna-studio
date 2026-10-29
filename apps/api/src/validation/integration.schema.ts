import { connectIntegrationBodySchema } from '@repo/integrations';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

export const validConnectIntegrationBody = myzValidator('json', connectIntegrationBodySchema);

export const validOauthCallbackQuery = myzValidator(
  'query',
  z.object({
    state: z.string().max(200).optional(),
    code: z.string().max(2000).optional(),
    error: z.string().max(200).optional(),
  }),
);

export const validIntegrationConnectionIdParam = myzValidator(
  'param',
  z.object({ connectionId: z.uuidv7() }),
);
