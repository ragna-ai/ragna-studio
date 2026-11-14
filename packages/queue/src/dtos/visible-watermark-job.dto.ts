import { z } from 'zod';

const watermarkImageOutputSchema = z.object({
  genImageId: z.uuidv7(),
  bucket: z.string().min(1),
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

export const visibleWatermarkJobSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    genImageIds: z.array(z.uuidv7()),
    outputs: z.array(watermarkImageOutputSchema),
  }),
  z.object({
    kind: z.literal('video'),
    genVideoId: z.uuidv7(),
    bucket: z.string().min(1),
    storageKey: z.string().min(1),
    mimeType: z.string().min(1),
    size: z.number().int().positive(),
    draftCacheKey: z.string().nullable(),
  }),
]);

export type VisibleWatermarkJobData = z.infer<typeof visibleWatermarkJobSchema>;
export type VisibleWatermarkImageOutput = z.infer<typeof watermarkImageOutputSchema>;

export const APPLY_VISIBLE_WATERMARK_JOB = 'apply-visible-watermark';
