import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validChatIdParam = myzValidator(
  'param',
  z.object({
    chatId: primaryId,
  }),
);

// workspaceId comes from the path (`/workspace/:workspaceId/chat`, guarded by
// workspaceGuard), never the body.
export const validCreateChatBody = myzValidator(
  'json',
  z.object({
    agentId: primaryId.optional(),
  }),
);

export const validUpdateChatTitleBody = myzValidator(
  'json',
  z.object({
    title: z.string().trim().min(1).max(255),
  }),
);
