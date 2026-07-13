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
    inlineDynamicImports: true,
  },
  inputOptions: {
    // gray-matter (via @repo/mail -> @maizzle/framework) uses direct eval
    // in its JS front-matter engine, which we never use. Hide the warning.
    onLog(level, log, defaultHandler) {
      if (log.code === 'EVAL' && log.id?.includes('gray-matter')) return;
      defaultHandler(level, log);
    },
  },
});
