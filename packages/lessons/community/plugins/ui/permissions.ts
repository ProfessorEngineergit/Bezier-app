/** User-facing permission descriptions, phrased as what the plugin could do. */

import { PERMISSIONS, type Permission, type PluginManifest } from '../format/manifest.js';

const SENTENCES: Record<Permission, string> = {
  'project:read': 'Read the model you have open',
  'project:create': 'Open models it makes as new projects',
  'selection:read': 'See what you have selected',
  'ui:panel': 'Show a panel beside the model',
  'ui:command': 'Add commands',
  'files:export': 'Offer files to save — you confirm each one',
  'files:import': 'Read files you choose for it',
  storage: 'Keep up to 1 MB of its own settings',
  network: 'Connect to the internet',
};

const ORDER: Permission[] = Object.keys(PERMISSIONS) as Permission[];

export interface PermissionLine {
  permission: Permission;
  text: string;
  risk: 'low' | 'medium' | 'high';
}

export function describePermissions(
  manifest: Pick<PluginManifest, 'permissions' | 'network'>,
): PermissionLine[] {
  return [...manifest.permissions]
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
    .map((permission) => ({
      permission,
      text:
        permission === 'network'
          ? `Connect to ${(manifest.network ?? []).map((origin) => new URL(origin).host).join(', ')}`
          : SENTENCES[permission],
      risk: PERMISSIONS[permission],
    }));
}

/** A warning for `project:read` plus `network`, the combination that can exfiltrate the model. */
export function warning(manifest: Pick<PluginManifest, 'permissions' | 'network'>): string | null {
  if (!manifest.permissions.includes('project:read') || !manifest.permissions.includes('network')) {
    return null;
  }
  const hosts = (manifest.network ?? []).map((origin) => new URL(origin).host).join(', ');
  return `This plugin can read your model and send it to ${hosts}. Install it only if you trust its author.`;
}

export const NEVER =
  'No plugin can reach your other projects, your lessons, the rest of Bezier, or any site you did not allow.';
