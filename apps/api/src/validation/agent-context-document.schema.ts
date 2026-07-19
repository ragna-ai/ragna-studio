import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validAgentContextDocumentParams = myzValidator(
  'param',
  z.object({
    agentId: primaryId,
    documentId: primaryId,
  }),
);

export const validRenameAgentContextDocumentBody = myzValidator(
  'json',
  z.object({
    name: z.string().trim().min(1).max(255),
  }),
);
