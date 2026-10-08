import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// At runtime, import.meta.url is dist/index.mjs → templates resolves to the
// dist/templates/ copy placed there by tsdown.config.ts's `copy` option.
const emailsDir = resolve(dirname(fileURLToPath(import.meta.url)), 'templates');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templates: Record<string, (vars: any) => { path: string; vars: Record<string, unknown> }> = {
  welcome: (vars) => ({ path: resolve(emailsDir, 'welcome.vue'), vars }),
};

export function getTemplate(
  templateId: string,
  variables: Record<string, unknown>,
): { path: string; vars: Record<string, unknown> } {
  const fn = templates[templateId];
  if (!fn) throw new Error(`Unknown email template: ${templateId}`);
  return fn(variables);
}
