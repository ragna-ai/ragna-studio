import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/schema/index.ts',
    './src/scripts/migrate.ts',
    './src/seed/index.ts',
  ],
});
