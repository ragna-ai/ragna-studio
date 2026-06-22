import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: './src/index.ts',
  platform: 'node',
  shims: true,
  deps: {
    alwaysBundle: [/.*/],
  },
});
