import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/catalog/index.ts', 'src/cloud-drive/index.ts', 'src/http/index.ts'],
});
