import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();

export const validSocialPostIdParam = myzValidator(
  'param',
  z.object({
    socialPostId: primaryId,
  }),
);

// New drafts may start empty: the user fills in content on the upsert page.
// Publish rejects empty content instead. workspaceId comes from the path,
// not the body.
export const validCreateSocialPostBody = myzValidator(
  'json',
  z.object({
    content: z.string().max(3000),
  }),
);

export const validUpdateSocialPostBody = myzValidator(
  'json',
  z.object({
    content: z.string().min(1).max(3000),
  }),
);

export const validSocialPostMediaParams = myzValidator(
  'param',
  z.object({
    socialPostId: primaryId,
    mediaId: primaryId,
  }),
);

// LinkedIn's own altText limit: max 4086 characters, recommended under 120.
export const validUpdateSocialPostMediaBody = myzValidator(
  'json',
  z.object({
    altText: z.string().max(4086),
  }),
);
