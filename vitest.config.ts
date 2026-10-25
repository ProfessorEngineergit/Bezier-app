import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every package keeps its tests next to the code it tests, as `*.test.ts`.
    include: [
      '{packages,apps}/*/src/**/*.test.ts',
      'packages/lessons/community/**/*.test.ts',
      'apps/mcp-server/**/*.test.ts',
    ],
    environment: 'node',
  },
});
