import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Bundles the TypeScript server (with `.js` import specifiers Node cannot run directly) into
// dist-server.
export default defineConfig({
  // Paths are relative to the repository root; Vite runs from apps/studio.
  root: resolve(import.meta.dirname, '../../..'),
  // Bundle fflate so dist-server needs only Node.
  ssr: { noExternal: ['fflate'] },
  build: {
    ssr: true,
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      input: {
        store: 'packages/lessons/community/server/store-main.ts',
        main: 'packages/lessons/community/server/main.ts',
        cli: 'packages/lessons/community/server/cli.ts',
        dev: 'packages/lessons/community/dev/serve.ts',
        'plugins-main': 'packages/lessons/community/plugins/server/main.ts',
        'plugins-cli': 'packages/lessons/community/plugins/server/cli.ts',
        'plugins-dev': 'packages/lessons/community/plugins/dev/serve.ts',
        'docs-main': 'packages/lessons/community/docs/server/main.ts',
        'docs-cli': 'packages/lessons/community/docs/server/cli.ts',
        'docs-dev': 'packages/lessons/community/docs/dev/serve.ts',
        'dev-all': 'packages/lessons/community/dev/serve-all.ts',
      },
      // Vite's built-in list lacks node:sqlite.
      external: [/^node:/],
      output: { entryFileNames: '[name].js' },
    },
  },
});
