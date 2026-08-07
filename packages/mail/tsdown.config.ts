import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: 'src/index.ts',
  // Email templates are read from disk at runtime (@maizzle/framework renders
  // the .vue file by path), so they can't be bundled into dist/index.mjs.
  // Ship them alongside dist so they survive package.json's "files": ["dist"]
  // when pnpm materializes this package for an injected/deployed consumer.
  copy: [{ from: 'src/templates/*.vue', to: 'dist/templates' }],
});
