import { z } from 'zod';

export const EXTRACT_MEDIA_TEXT_JOB = 'extract-media-text';
export const MEDIA_TEXT_EXTRACTION_ATTEMPTS = 3;

export const extractMediaTextJobSchema = z.object({
  mediaId: z.uuidv7(),
});

export type ExtractMediaTextJobData = z.infer<typeof extractMediaTextJobSchema>;

export interface ExtractMediaTextJob {
  name: typeof EXTRACT_MEDIA_TEXT_JOB;
  data: ExtractMediaTextJobData;
  opts: { jobId: string; attempts: number; backoff: { type: 'exponential'; delay: number } };
}

/** The media id is the job id, so the upload and the sweep can't queue the same file twice. */
export function buildExtractMediaTextJob(mediaId: string): ExtractMediaTextJob {
  return {
    name: EXTRACT_MEDIA_TEXT_JOB,
    data: extractMediaTextJobSchema.parse({ mediaId }),
    opts: {
      jobId: mediaId,
      attempts: MEDIA_TEXT_EXTRACTION_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
    },
  };
}
