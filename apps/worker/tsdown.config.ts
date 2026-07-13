import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: './src/index.ts',
  platform: 'node',
  shims: true,
  deps: {
    alwaysBundle: [/.*/],
  },
  // Workaround for a rolldown panic in compute_cross_chunk_links:
  // shiki (via @repo/mail -> @maizzle/framework) uses dynamic imports
  // that trigger chunk splitting. A single chunk avoids the bug.
  outputOptions: {
    codeSplitting: false,
  },
});
