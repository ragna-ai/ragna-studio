import { z } from 'zod';

export const genVideoJobSchema = z.object({
  genVideoId: z.uuidv7(),
});

export type GenVideoJobData = z.infer<typeof genVideoJobSchema>;

export const GEN_VIDEO_JOB = 'gen-video-job';
