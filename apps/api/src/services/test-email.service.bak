import { sendEmail } from '@repo/mail';

export function sendTestEmail(to: string) {
  return sendEmail({
    templateId: 'welcome',
    variables: { name: 'Test User' },
    to,
    subject: 'Test email',
  });
}
