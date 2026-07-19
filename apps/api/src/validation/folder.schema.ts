import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validFolderIdParam = myzValidator(
  'param',
  z.object({
    folderId: primaryId,
  }),
);

const folderNameBodySchema = z.object({
  name: z.string().min(1).max(255),
});

export const validCreateFolderBody = myzValidator('json', folderNameBodySchema);

export const validRenameFolderBody = myzValidator('json', folderNameBodySchema);
