/**
 * Update and revocation checks: revoked versions are disabled, and an update that needs new
 * permissions reports them so the user is asked again.
 */

import type { Source } from '../../client/sources.js';
import type { Permission } from '../format/manifest.js';
import { compareVersions } from '../format/manifest.js';
import { pluginDetail } from './api.js';
import type { PluginEntry } from './catalog.js';
import { type InstalledPlugin, saveInstalled } from './installed.js';

export type PluginState =
  | { kind: 'current' }
  | { kind: 'update'; entry: PluginEntry; newPermissions: Permission[] }
  | { kind: 'revoked' }
  | { kind: 'unknown' };

/** Permissions in `wanted` the user has not granted. */
export const newPermissions = (wanted: Permission[], granted: Permission[]): Permission[] =>
  wanted.filter((permission) => !granted.includes(permission));

/** Queries the plugin's server. A revoked version is disabled immediately. */
export async function checkPlugin(
  plugin: InstalledPlugin,
  sources: Source[],
): Promise<PluginState> {
  const source = sources.find((s) => s.url === plugin.source);
  if (source === undefined) return { kind: 'unknown' };
  let detail: Awaited<ReturnType<typeof pluginDetail>>;
  try {
    detail = await pluginDetail(source, plugin.id);
  } catch {
    return { kind: 'unknown' };
  }
  if (detail.revoked.includes(plugin.manifest.pluginVersion)) {
    if (plugin.enabled) await saveInstalled({ ...plugin, enabled: false });
    return { kind: 'revoked' };
  }
  const entry = detail.plugin;
  if (entry === null || compareVersions(entry.version, plugin.manifest.pluginVersion) <= 0) {
    return { kind: 'current' };
  }
  return {
    kind: 'update',
    entry,
    newPermissions: newPermissions(entry.permissions, plugin.granted),
  };
}
