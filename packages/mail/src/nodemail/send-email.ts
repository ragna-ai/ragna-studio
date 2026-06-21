import { config } from '@repo/config';
import { getTransporter } from './transporter';

export async function sendEmail({
  templateId,
  variables,
  to,
  subject,
}: {
  templateId: string;
  variables: Record<string, any>;
  to: string;
  subject: string;
}) {
  const transporter = await getTransporter();
  // const template = await getTemplate({ templateId, variables });
  // const emailHtmlPromise = render(template);
  // const emailTextPromise = render(template, { plainText: true });

  // const [emailHtml, emailText] = await Promise.all([emailHtmlPromise, emailTextPromise]);

  if (!transporter) {
    throw new Error('Email transporter is not configured');
  }

  return transporter.sendMail({
    from: config.mailFrom,
    to,
    subject,
    // text: emailText,
    // html: emailHtml,
  });
}
