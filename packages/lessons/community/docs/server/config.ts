/** Docs server configuration, read once from the environment. */

export interface DocsConfig {
  name: string;
  description: string;
  dataDir: string;
  host: string;
  port: number;
  origins: string[];
  trustProxy: boolean;
}

const number = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function readDocsConfig(env: NodeJS.ProcessEnv = process.env): DocsConfig {
  return {
    name: (env.DOCS_NAME ?? 'Community docs').slice(0, 60),
    description: (env.DOCS_DESCRIPTION ?? '').slice(0, 300),
    dataDir: env.DOCS_DATA ?? './data-docs',
    // Loopback by default; only the TLS reverse proxy should reach it.
    host: env.DOCS_HOST ?? '127.0.0.1',
    port: number(env.DOCS_PORT, 8791),
    origins: (env.DOCS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
    trustProxy: env.DOCS_TRUST_PROXY === '1',
  };
}
