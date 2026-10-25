import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agentDocs } from './agent-docs.js';

const FILE = new URL('../../../mcp-server/docs/agent-docs.json', import.meta.url);

describe('the docs the MCP server serves', () => {
  // The server reads a generated file so it runs on plain Node. Regenerate with
  // `UPDATE_AGENT_DOCS=1 pnpm test agent-docs`.
  it('are the articles as they are now', () => {
    const now = `${JSON.stringify(agentDocs(), null, 1)}\n`;
    if (process.env.UPDATE_AGENT_DOCS === '1') writeFileSync(FILE, now);
    expect(readFileSync(FILE, 'utf8')).toBe(now);
  });
});
