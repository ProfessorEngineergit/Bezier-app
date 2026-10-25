import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// bezier-plugin shares the store's checks (community/plugins); bundled into one file it runs with
// Node alone.
export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  ssr: { noExternal: ['fflate'] },
  build: {
    ssr: true,
    outDir: 'dist-sdk',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      input: { 'bezier-plugin': 'packages/plugin-sdk/src/cli.ts' },
      external: [/^node:/],
      output: { entryFileNames: '[name].js', banner: '#!/usr/bin/env node' },
    },
  },
});
