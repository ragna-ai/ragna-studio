import { z } from 'zod';

export const getSocialProfileJobSchema = z.object({
  userId: z.uuidv7(),
  platform: z.string().trim().min(1),
});

export type GetSocialProfileJobData = z.infer<typeof getSocialProfileJobSchema>;

export const GET_SOCIAL_PROFILE_JOB = 'get-social-profile-job';
