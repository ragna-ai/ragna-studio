import { config } from '@repo/config';
import { renderEmail } from './render-email';
import { getTransporter } from './transporter';

export async function sendEmail({
  templateId,
  variables,
  to,
  subject,
}: {
  templateId: string;
  variables: Record<string, unknown>;
  to: string;
  subject: string;
}) {
  const transporter = await getTransporter();

  if (!transporter) {
    throw new Error('Email transporter is not configured');
  }

  const { html, plaintext } = await renderEmail(templateId, variables);

  return transporter.sendMail({
    from: config.mailFrom,
    to,
    subject,
    text: plaintext,
    html,
  });
}
