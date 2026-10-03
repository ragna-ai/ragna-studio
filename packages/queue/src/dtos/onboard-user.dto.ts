import { z } from 'zod';

export const onboardUserJobSchema = z.object({
  userId: z.uuidv7(),
});

export type OnboardUserJobData = z.infer<typeof onboardUserJobSchema>;

export const ONBOARD_USER_JOB = 'onboard-user-job';
