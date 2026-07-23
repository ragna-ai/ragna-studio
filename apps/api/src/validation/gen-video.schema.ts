import { generateVideoSchema } from '@repo/ai';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';
import { paginationSchema } from './pagination.schema';

export const validGenVideoListQuery = myzValidator('query', paginationSchema);

// Same ownership split as gen_videos.frameOrigin (docs/videogen/prd.md
// decision 3): a 'genImage' frame references another workspace image the
// caller doesn't own (resolved to a storage key in the service); an
// 'upload' frame owns the object produced by the frame-upload endpoint
// below. A discriminated union is fine for HTTP validation; the flat-object
// rule only applies to AI tool schemas.
const genVideoFrameSchema = z.discriminatedUnion('origin', [
  z.object({ origin: z.literal('genImage'), genImageId: z.uuidv7() }),
  z.object({ origin: z.literal('upload'), storageKey: z.string().min(1) }),
]);

// Veo only documents 1080p for 16:9; 9:16 stays at 720p
// (packages/ai/src/services/videogen.service.ts,
// supportedResolutionsByAspectRatio). Reject the invalid combination here
// instead of letting it silently downgrade deep inside the AI package.
function isValidAspectResolutionCombo(data: { aspectRatio?: string; resolution?: string }) {
  return !(data.aspectRatio === '9:16' && data.resolution === '1080p');
}

export const validGenerateVideoBody = myzValidator(
  'json',
  generateVideoSchema
    .extend({ frame: genVideoFrameSchema.optional() })
    .refine(isValidAspectResolutionCombo, {
      message: '1080p is only available for 16:9 videos',
      path: ['resolution'],
    }),
);
