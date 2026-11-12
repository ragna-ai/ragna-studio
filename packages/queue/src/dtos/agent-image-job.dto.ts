import { z } from 'zod';

export const processAgentImageJobSchema = z.object({
  mediaId: z.uuidv7(),
});

export type ProcessAgentImageJobData = z.infer<typeof processAgentImageJobSchema>;

export const PROCESS_AGENT_IMAGE_JOB = 'process-agent-image-job';
