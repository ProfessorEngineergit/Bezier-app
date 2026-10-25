/** Plugin server configuration, read once from the environment. */

export interface PluginConfig {
  name: string;
  description: string;
  dataDir: string;
  host: string;
  port: number;
  origins: string[];
  trustProxy: boolean;
  reportThreshold: number;
}

const number = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function readPluginConfig(env: NodeJS.ProcessEnv = process.env): PluginConfig {
  return {
    name: (env.PLUGINS_NAME ?? 'Community plugins').slice(0, 60),
    description: (env.PLUGINS_DESCRIPTION ?? '').slice(0, 300),
    dataDir: env.PLUGINS_DATA ?? './data-plugins',
    // Loopback by default; only the TLS reverse proxy should reach it.
    host: env.PLUGINS_HOST ?? '127.0.0.1',
    port: number(env.PLUGINS_PORT, 8789),
    origins: (env.PLUGINS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
    trustProxy: env.PLUGINS_TRUST_PROXY === '1',
    reportThreshold: number(env.PLUGINS_REPORT_THRESHOLD, 3),
  };
}
