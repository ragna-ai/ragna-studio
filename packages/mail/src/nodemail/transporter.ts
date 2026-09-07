import { config } from '@repo/config';
import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter;

export async function getTransporter(): Promise<Transporter> {
  if (transporter) {
    return transporter;
  }
  const isBrevo = config.mailTransport === 'brevo';

  if (isBrevo) {
    const BrevoTransport = (await import('nodemailer-brevo-transport')).default;
    transporter = nodemailer.createTransport(
      new BrevoTransport({
        apiKey: config.getSecret('BREVO_API_KEY'),
      }),
    );
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    auth: {
      user: config.smtpUser,
      pass: config.getSecret('SMTP_PASSWORD'),
    },
  });

  return transporter;
}
