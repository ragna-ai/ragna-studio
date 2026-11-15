import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// At runtime, import.meta.url is dist/index.mjs → templates resolves to the
// dist/templates/ copy placed there by tsdown.config.ts's `copy` option.
export const templatesDir = resolve(dirname(fileURLToPath(import.meta.url)), 'templates');

export const TRANSACTIONAL_TEMPLATE_FILE = 'transactional.vue';
