import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

// Mirrors McpAccess (@repo/database): one optional level per integration id.
// Hand-written rather than derived, since McpIntegrationId's literal union
// isn't available as a zod enum from the package.
export const mcpAccessSchema = z.object({
  datasets: z.enum(['off', 'read', 'write']).optional(),
});

export const validMcpSettingsBody = myzValidator(
  'json',
  z.object({
    enabled: z.boolean(),
    access: mcpAccessSchema,
  }),
);

export const validCreateMcpConnectionBody = myzValidator(
  'json',
  z.object({
    clientId: z.string().min(1),
    workspaceId: z.uuidv7(),
  }),
);

export const validMcpConnectionIdParam = myzValidator(
  'param',
  z.object({
    connectionId: z.uuidv7(),
  }),
);
