import { connectIntegrationBodySchema } from '@repo/integrations';
import { integrationIdSchema } from '@repo/integrations/catalog';
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

export const validIntegrationBindingParam = myzValidator(
  'param',
  z.object({ connectionId: z.uuidv7(), integrationId: integrationIdSchema }),
);
