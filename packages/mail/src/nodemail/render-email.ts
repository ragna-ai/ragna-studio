import { render } from '@maizzle/framework';
import { readFile } from 'node:fs/promises';
import { getTemplate } from '../templates';

export interface RenderedEmail {
  html: string;
  plaintext: string | undefined;
}

// Maizzle's auto-import plugin skips files under node_modules, so a template
// path inside an installed package fails with "defineConfig is not defined".
// Render the SFC source instead.
export async function renderEmail(
  templateId: string,
  variables: Record<string, unknown>,
  templatesDir?: string,
): Promise<RenderedEmail> {
  const { path, vars } = getTemplate(templateId, variables, templatesDir);
  const source = await readFile(path, 'utf8');
  const { html, plaintext } = await render(source, { plaintext: true, ...vars });
  return { html, plaintext };
}
