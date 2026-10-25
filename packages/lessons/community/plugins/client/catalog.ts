/**
 * A plugin server's catalogue. Fully validated, since the server is untrusted and these fields
 * become URLs, download limits and the permissions the user is asked to grant.
 */

import { SHA256_PATTERN } from '../../client/limits.js';
import {
  isNetworkOrigin,
  isPermission,
  type Permission,
  PLUGIN_ID,
  PLUGIN_LIMITS,
} from '../format/manifest.js';

export interface PluginEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  /** The newest approved version. */
  version: string;
  permissions: Permission[];
  network: string[];
  size: number;
  sha256: string;
  /** ISO 8601. */
  updatedAt: string;
}

export interface PluginPage {
  plugins: PluginEntry[];
  next?: string;
}

export interface PluginDetail {
  plugin: PluginEntry | null;
  /** Versions revoked by the server owner; installed copies are disabled. */
  revoked: string[];
}

const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

export function isPluginEntry(value: unknown): value is PluginEntry {
  if (value === null || typeof value !== 'object') return false;
  const e = value as Partial<Record<keyof PluginEntry, unknown>>;
  return (
    typeof e.id === 'string' &&
    PLUGIN_ID.test(e.id) &&
    text(e.name, PLUGIN_LIMITS.name) &&
    text(e.description, PLUGIN_LIMITS.description) &&
    text(e.author, 80) &&
    typeof e.version === 'string' &&
    VERSION.test(e.version) &&
    Array.isArray(e.permissions) &&
    e.permissions.every(isPermission) &&
    Array.isArray(e.network) &&
    e.network.length <= PLUGIN_LIMITS.networkOrigins &&
    e.network.every(isNetworkOrigin) &&
    typeof e.size === 'number' &&
    Number.isInteger(e.size) &&
    e.size > 0 &&
    e.size <= PLUGIN_LIMITS.packageBytes &&
    typeof e.sha256 === 'string' &&
    SHA256_PATTERN.test(e.sha256) &&
    text(e.updatedAt, 40)
  );
}

export function isPluginPage(value: unknown): value is PluginPage {
  if (value === null || typeof value !== 'object') return false;
  const page = value as Partial<Record<keyof PluginPage, unknown>>;
  return (
    Array.isArray(page.plugins) &&
    page.plugins.length <= 100 &&
    page.plugins.every(isPluginEntry) &&
    (page.next === undefined || text(page.next, 64))
  );
}

export function isPluginDetail(value: unknown): value is PluginDetail {
  if (value === null || typeof value !== 'object') return false;
  const d = value as Partial<Record<keyof PluginDetail, unknown>>;
  return (
    (d.plugin === null || isPluginEntry(d.plugin)) &&
    Array.isArray(d.revoked) &&
    d.revoked.length <= 1000 &&
    d.revoked.every((v) => typeof v === 'string' && VERSION.test(v))
  );
}
