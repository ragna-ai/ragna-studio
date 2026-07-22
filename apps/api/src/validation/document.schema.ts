import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validDocumentIdParam = myzValidator(
  'param',
  z.object({
    documentId: primaryId,
  }),
);

export const validCreateDocumentBody = myzValidator(
  'json',
  z.object({
    title: z.string().min(1).max(255),
    content: z.string().max(1_000_000).optional(),
    folderId: primaryId.nullish(),
  }),
);

export const validUpdateDocumentBody = myzValidator(
  'json',
  z.object({
    title: z.string().min(1).max(255).optional(),
    content: z.string().max(1_000_000).optional(),
    folderId: primaryId.nullish(),
  }),
);

export const validDocumentExportQuery = myzValidator(
  'query',
  z.object({
    format: z.enum(['md', 'txt', 'pdf', 'docx']),
  }),
);
