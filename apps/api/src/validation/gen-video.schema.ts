import { generateVideoSchema } from '@repo/ai';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';
import { paginationSchema } from './pagination.schema';

export const validGenVideoListQuery = myzValidator('query', paginationSchema);

export const validGenVideoIdParam = myzValidator(
  'param',
  z.object({ genVideoId: z.uuidv7() }),
);

// Same ownership split as gen_videos.frameOrigin (docs/videogen/prd.md
// decision 3): a 'genImage' frame references another workspace image the
// caller doesn't own (resolved to a storage key in the service); an
// 'upload' frame names a workspace media row by id, produced by the
// frame-upload endpoint (the client never sends a storage key).
// A discriminated union is fine for HTTP validation; the flat-object
// rule only applies to AI tool schemas.
const genVideoFrameSchema = z.discriminatedUnion('origin', [
  z.object({ origin: z.literal('genImage'), genImageId: z.uuidv7() }),
  z.object({ origin: z.literal('upload'), mediaId: z.uuidv7() }),
]);

// Veo (google-vertex) only documents 1080p for 16:9; 9:16 stays at 720p
// (packages/ai/src/services/videogen.service.ts,
// supportedResolutionsByAspectRatio). BFL has no such restriction: both
// tiers are available at every one of its ratios, including 9:16
// (videoGenCapabilities.bfl.resolutionsByAspectRatio), so this check must
// stay provider-aware now that the schema is shared (docs/videogen/prd-v2.md
// decision 5). No provider means the request falls back to the default
// video model, which is Veo (goal: "Veo stays the default-by-modality"), so
// the vertex rule applies to the unset case too. Reject the invalid
// combination here instead of letting it silently downgrade deep inside the
// AI package.
function isValidAspectResolutionCombo(data: {
  provider?: string;
  aspectRatio?: string;
  resolution?: string;
}) {
  const isVertex = data.provider === undefined || data.provider === 'google-vertex';
  return !(isVertex && data.aspectRatio === '9:16' && data.resolution === '1080p');
}

export const validGenerateVideoBody = myzValidator(
  'json',
  generateVideoSchema
    .extend({ frame: genVideoFrameSchema.optional() })
    .refine(isValidAspectResolutionCombo, {
      message: '1080p is only available for 16:9 videos on the Veo (google-vertex) provider',
      path: ['resolution'],
    }),
);
