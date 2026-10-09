import { z } from 'zod';

export const verifyEmailJobSchema = z.object({
  email: z.email(),
  url: z.string().trim().min(1),
});

export type VerifyEmailJobData = z.infer<typeof verifyEmailJobSchema>;

export const VERIFY_EMAIL_JOB = 'send-verification-email-job';

export const welcomeEmailJobSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1),
});

export type WelcomeEmailJobData = z.infer<typeof welcomeEmailJobSchema>;

export const WELCOME_EMAIL_JOB = 'send-welcome-email-job';

export const invitationEmailJobSchema = z.object({
  email: z.email(),
  inviterName: z.string().trim().min(1),
  organizationName: z.string().trim().min(1),
  url: z.string().trim().min(1),
});

export type InvitationEmailJobData = z.infer<typeof invitationEmailJobSchema>;

export const INVITATION_EMAIL_JOB = 'send-invitation-email-job';
