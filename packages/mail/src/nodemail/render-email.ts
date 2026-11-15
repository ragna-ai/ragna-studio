import { render } from '@maizzle/framework';
import type { UserLocale } from '@repo/utils';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TRANSACTIONAL_TEMPLATE_FILE, templatesDir } from '../templates';
import { buildTransactionalContent, type TransactionalEmail } from '../transactional';

export interface RenderedEmail {
  subject: string;
  html: string;
  plaintext: string | undefined;
}

// Maizzle's auto-import plugin skips files under node_modules, so a template
// path inside an installed package fails with "defineConfig is not defined".
// Render the SFC source instead.
export async function renderTransactionalEmail(
  locale: UserLocale,
  email: TransactionalEmail,
  dir: string = templatesDir,
): Promise<RenderedEmail> {
  const { subject, ...props } = buildTransactionalContent(locale, email);
  const source = await readFile(resolve(dir, TRANSACTIONAL_TEMPLATE_FILE), 'utf8');
  const { html, plaintext } = await render(source, { plaintext: true, locale, ...props });
  return { subject, html, plaintext };
}
