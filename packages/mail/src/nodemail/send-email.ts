import { config } from '@repo/config';
import type { UserLocale } from '@repo/utils';
import type { TransactionalEmail } from '../transactional';
import { renderTransactionalEmail } from './render-email';
import { getTransporter } from './transporter';

export interface SendEmailInput {
  to: string;
  locale: UserLocale;
  email: TransactionalEmail;
}

export async function sendEmail({ to, locale, email }: SendEmailInput) {
  const transporter = await getTransporter();

  if (!transporter) {
    throw new Error('Email transporter is not configured');
  }

  const { subject, html, plaintext } = await renderTransactionalEmail({ to, locale, email });

  return transporter.sendMail({
    from: config.mailFrom,
    to,
    subject,
    text: plaintext,
    html,
  });
}
