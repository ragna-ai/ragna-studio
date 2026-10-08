import { defineConfig } from '@maizzle/framework';

export default defineConfig({
  content: ['src/templates/**/*.vue'],
  output: { path: 'dist/emails' },
});
