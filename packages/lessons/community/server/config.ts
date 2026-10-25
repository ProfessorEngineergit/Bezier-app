/** Lessons server configuration, read once from the environment. */

import { LIMITS } from '../client/limits.js';

export interface Config {
  /** Display name shown when the server is added, e.g. "Ada’s CAD lessons". */
  name: string;
  description: string;
  dataDir: string;
  host: string;
  port: number;
  /** CORS origins allowed to call this server; `*` allows reading from anywhere. */
  origins: string[];
  /** Read the client address from X-Forwarded-For (behind Caddy, nginx or a tunnel). */
  trustProxy: boolean;
  /** Executable run with each uploaded package's path; a non-zero exit rejects it. */
  screenCommand: string | undefined;
  /** Distinct reports after which a lesson returns to review. */
  reportThreshold: number;
  maxUploadBytes: number;
}

const number = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    name: (env.LESSONS_NAME ?? 'Community lessons').slice(0, 60),
    description: (env.LESSONS_DESCRIPTION ?? '').slice(0, 300),
    dataDir: env.LESSONS_DATA ?? './data',
    // Loopback by default; only the TLS reverse proxy should reach it.
    host: env.LESSONS_HOST ?? '127.0.0.1',
    port: number(env.LESSONS_PORT, 8787),
    origins: (env.LESSONS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
    trustProxy: env.LESSONS_TRUST_PROXY === '1',
    screenCommand: env.LESSONS_SCREEN_CMD,
    reportThreshold: number(env.LESSONS_REPORT_THRESHOLD, 3),
    maxUploadBytes: Math.min(
      number(env.LESSONS_MAX_UPLOAD_MB, 256) * 1_000_000,
      LIMITS.packageBytes,
    ),
  };
}
