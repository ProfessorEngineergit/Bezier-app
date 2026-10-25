/**
 * Version 1 of the `bezier-plugin` format.
 *
 * A plugin is one readable JavaScript file plus this manifest. It runs in a sandboxed frame with
 * no origin, and everything it can do goes through a permission listed here and granted by the
 * user at install. See community/plugins/README.md.
 */

/**
 * All permissions a plugin can request, with their risk level. Anything else (the editor page,
 * other plugins, the user's files, cookies, camera, clipboard, navigation, new windows) is
 * unreachable.
 */
export const PERMISSIONS = {
  /** Read the open model as Bezier project text. */
  'project:read': 'high',
  /** Open a model it made as a new project. Never changes an existing one. */
  'project:create': 'medium',
  /** The ids of what is selected in the open model. */
  'selection:read': 'low',
  /** Show its own panel beside the model. */
  'ui:panel': 'low',
  /** Add commands to the editor's command list. */
  'ui:command': 'low',
  /** Offer a file to save. The user confirms each one. */
  'files:export': 'medium',
  /** Read a file the user picks. */
  'files:import': 'medium',
  /** Keep up to 1 MB of its own settings on this device. */
  storage: 'low',
  /** Connect to the https origins listed in `network`, and nowhere else. */
  network: 'high',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type Risk = (typeof PERMISSIONS)[Permission];

export interface PluginManifest {
  format: 'bezier-plugin';
  version: 1;
  /** Lower-case words joined by dots or dashes (`ada.stl-export`); owned by its first publisher. */
  id: string;
  name: string;
  description: string;
  /** Semantic version of the plugin, e.g. `1.4.0`. */
  pluginVersion: string;
  /** The plugin API it was written against; only 1 exists. */
  api: 1;
  permissions: Permission[];
  /** The https origins it may reach, with the `network` permission; otherwise absent or empty. */
  network?: string[];
}

export const PLUGIN_LIMITS = {
  /** Maximum size of main.js in bytes, small enough to review by hand. */
  codeBytes: 512_000,
  /** Maximum line length in main.js, since minified code cannot be reviewed. */
  lineLength: 1_000,
  packageBytes: 600_000,
  name: 60,
  description: 500,
  networkOrigins: 4,
  /** Storage quota in bytes with the `storage` permission. */
  storageBytes: 1_000_000,
} as const;

export const PLUGIN_ID = /^(?=.{3,64}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && Object.hasOwn(PERMISSIONS, value);

/** Whether `value` is a bare https origin: no path, credentials or wildcard. */
export function isNetworkOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 200) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.hostname.includes('*');
  } catch {
    return false;
  }
}

/** Compares two versions; negative when `a` is older. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** A one-sentence reason `value` is not a valid manifest, or null. */
export function manifestProblem(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return 'The plugin has no manifest.';
  const m = value as Partial<Record<keyof PluginManifest, unknown>>;
  if (m.format !== 'bezier-plugin' || m.version !== 1) {
    return 'This plugin was made in a format this app cannot read.';
  }
  if (m.api !== 1) return 'This plugin needs a newer version of Bezier.';
  if (typeof m.id !== 'string' || !PLUGIN_ID.test(m.id)) {
    return 'The plugin id must be 3–64 lower-case letters and digits, joined by dots or dashes.';
  }
  if (typeof m.name !== 'string' || m.name.trim() === '' || m.name.length > PLUGIN_LIMITS.name) {
    return `Give the plugin a name of at most ${PLUGIN_LIMITS.name} characters.`;
  }
  if (typeof m.description !== 'string' || m.description.length > PLUGIN_LIMITS.description) {
    return `The description may be at most ${PLUGIN_LIMITS.description} characters.`;
  }
  if (typeof m.pluginVersion !== 'string' || !SEMVER.test(m.pluginVersion)) {
    return 'The plugin version must look like 1.0.0.';
  }
  const permissions = m.permissions;
  if (
    !Array.isArray(permissions) ||
    !permissions.every(isPermission) ||
    new Set(permissions).size !== permissions.length
  ) {
    return 'The plugin asks for a permission this app does not know.';
  }
  const network = m.network ?? [];
  if (!Array.isArray(network) || !network.every(isNetworkOrigin)) {
    return 'Network access must list https origins only, like https://api.example.org.';
  }
  if (network.length > PLUGIN_LIMITS.networkOrigins) {
    return `A plugin may reach at most ${PLUGIN_LIMITS.networkOrigins} origins.`;
  }
  if (permissions.includes('network') !== network.length > 0) {
    return 'List the origins the plugin connects to, together with the network permission.';
  }
  return null;
}

export const isPluginManifest = (value: unknown): value is PluginManifest =>
  manifestProblem(value) === null;
