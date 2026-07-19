import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validWorkspaceIdParam = myzValidator(
  'param',
  z.object({
    workspaceId: primaryId,
  }),
);

const workspaceNameBodySchema = z.object({
  name: z.string().min(1).max(255),
});

export const validCreateWorkspaceBody = myzValidator('json', workspaceNameBodySchema);

export const validRenameWorkspaceBody = myzValidator('json', workspaceNameBodySchema);
