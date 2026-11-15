import { render } from '@maizzle/framework';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TRANSACTIONAL_TEMPLATE_FILE, templatesDir } from '../templates';
import { buildTransactionalContent } from '../transactional';
import { buildRecipientLine } from '../transactional/recipient-line';
import type { SendEmailInput } from './send-email';

export interface RenderedEmail {
  subject: string;
  html: string;
  plaintext: string | undefined;
}

// Maizzle's auto-import plugin skips files under node_modules, so a template
// path inside an installed package fails with "defineConfig is not defined".
// Render the SFC source instead.
export async function renderTransactionalEmail(
  { to, locale, email }: SendEmailInput,
  dir: string = templatesDir,
): Promise<RenderedEmail> {
  const { subject, footerReason, ...body } = buildTransactionalContent(locale, email);
  const recipientLine = buildRecipientLine(locale, to, footerReason);
  const source = await readFile(resolve(dir, TRANSACTIONAL_TEMPLATE_FILE), 'utf8');
  const { html, plaintext } = await render(source, {
    plaintext: true,
    locale,
    ...body,
    recipientLine,
  });
  return { subject, html, plaintext };
}
