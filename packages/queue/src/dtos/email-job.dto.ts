import { DEFAULT_USER_LOCALE, userLocaleSchema } from '@repo/utils';
import { z } from 'zod';

export const welcomeEmailJobSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1),
  locale: userLocaleSchema.default(DEFAULT_USER_LOCALE),
});

export type WelcomeEmailJobData = z.infer<typeof welcomeEmailJobSchema>;

export const WELCOME_EMAIL_JOB = 'send-welcome-email-job';

export const invitationEmailJobSchema = z.object({
  email: z.email(),
  inviterName: z.string().trim().min(1),
  organizationName: z.string().trim().min(1),
  url: z.string().trim().min(1),
  locale: userLocaleSchema.default(DEFAULT_USER_LOCALE),
});

export type InvitationEmailJobData = z.infer<typeof invitationEmailJobSchema>;

export const INVITATION_EMAIL_JOB = 'send-invitation-email-job';

export const passkeyAddedEmailJobSchema = z.object({
  email: z.email(),
  userName: z.string().trim().min(1),
  passkeyName: z.string().trim().min(1),
  settingsUrl: z.url(),
  locale: userLocaleSchema.default(DEFAULT_USER_LOCALE),
});

export type PasskeyAddedEmailJobData = z.infer<typeof passkeyAddedEmailJobSchema>;

export const PASSKEY_ADDED_EMAIL_JOB = 'send-passkey-added-email-job';
