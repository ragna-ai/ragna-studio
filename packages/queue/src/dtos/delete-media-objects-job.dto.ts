import { z } from 'zod';

export const DELETE_MEDIA_OBJECTS_BATCH_SIZE = 1000;

export const deleteMediaObjectsJobSchema = z.object({
  objects: z
    .array(z.object({ bucket: z.string(), key: z.string() }))
    .max(DELETE_MEDIA_OBJECTS_BATCH_SIZE),
});

export type DeleteMediaObjectsJobData = z.infer<typeof deleteMediaObjectsJobSchema>;

export const DELETE_MEDIA_OBJECTS_JOB = 'delete-media-objects-job';
