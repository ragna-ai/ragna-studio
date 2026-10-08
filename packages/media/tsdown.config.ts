import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  // watermark.service.ts loads the badge SVG at runtime relative to
  // import.meta.url of the built bundle; the asset itself only reaches
  // dist/ via this copy (specs/ai-labeling/prd.md "Processing").
  copy: [{ from: 'assets/ai-badge.svg', to: 'dist/assets' }],
});
