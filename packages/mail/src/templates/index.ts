import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// At runtime, import.meta.url is dist/index.mjs → templates resolves to the
// dist/templates/ copy placed there by tsdown.config.ts's `copy` option.
const emailsDir = resolve(dirname(fileURLToPath(import.meta.url)), 'templates');

const templateFiles: Record<string, string> = {
  welcome: 'welcome.vue',
  invitation: 'invitation.vue',
};

export function getTemplate(
  templateId: string,
  variables: Record<string, unknown>,
  dir: string = emailsDir,
): { path: string; vars: Record<string, unknown> } {
  const file = templateFiles[templateId];
  if (!file) throw new Error(`Unknown email template: ${templateId}`);
  return { path: resolve(dir, file), vars: variables };
}
