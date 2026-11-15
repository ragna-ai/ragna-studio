import { config } from '@repo/config';

/** An empty allowlist permits everyone. */
export function isLoginEmailAllowed(email: string | null | undefined): boolean {
  const allowedEmails = config.allowedLoginEmails;
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(email?.toLowerCase() ?? '');
}
