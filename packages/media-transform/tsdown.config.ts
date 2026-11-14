import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  // watermark.service.ts reads the badge relative to the built dist/index.mjs.
  copy: [{ from: 'assets/ai-badge.svg', to: 'dist/assets' }],
});
