import { generateImagesSchema } from '@repo/ai';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';
import { paginationSchema } from './pagination.schema';

export const validGenImageListQuery = myzValidator('query', paginationSchema);

// Same ownership split as gen_images.referenceImages (docs/imagegen/prd.md
// decision 4): a 'genImage' reference points at another workspace image the
// caller doesn't own (resolved to a storage key in the service); an
// 'upload' reference owns the object produced by the reference-upload
// endpoint below. A discriminated union is fine for HTTP validation; the
// flat-object rule only applies to AI tool schemas.
const genImageReferenceSchema = z.discriminatedUnion('origin', [
  z.object({ origin: z.literal('genImage'), genImageId: z.uuidv7() }),
  z.object({ origin: z.literal('upload'), storageKey: z.string().min(1) }),
]);

// generateImagesSchema (@repo/ai) is the service-level shape: it takes a
// resolved provider + model pair and already-resolved reference storage
// keys. The HTTP body instead carries a single aiModelId (one lookup yields
// provider, model and capabilities together, docs/imagegen/prd.md decision
// 2) and a reference list that still needs resolving, so both are swapped
// out here and resolved in imagegen.service.ts.
export const validGenerateImagesBody = myzValidator(
  'json',
  generateImagesSchema.omit({ provider: true, model: true, referenceImages: true }).extend({
    aiModelId: z.uuidv7(),
    referenceImages: z.array(genImageReferenceSchema).max(4).optional(),
  }),
);
