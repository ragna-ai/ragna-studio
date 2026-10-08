import { render } from '@maizzle/framework';
import { config } from '@repo/config';
import { getTemplate } from '../templates';
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

  const { path, vars } = getTemplate(templateId, variables);
  const { html, plaintext } = await render(path, {
    plaintext: true,
    ...vars,
  });

  return transporter.sendMail({
    from: config.mailFrom,
    to,
    subject,
    text: plaintext,
    html,
  });
}
