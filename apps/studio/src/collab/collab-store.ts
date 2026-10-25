/**
 * Collaboration data on this device besides the projects: on/off, server, identity, machine name,
 * and library-to-shared project links. Stored in IndexedDB via `BrowserStore`, next to the sealed
 * vault copies. Nothing is stored until collaboration is switched on.
 */

import { BrowserStore, newDeviceId } from '@bezier/sync';
import type { LinkStore, ProjectLink } from './shared-projects.js';

export interface CollabConfig {
  readonly enabled: boolean;
  /** The server's address, once connected. */
  readonly server: string | null;
  /** The user's name, as others see it. */
  readonly name: string;
  /** This machine's name, shown to others next to the user's. */
  readonly machine: string;
  /** Random, created once per installation; tells one user's machines apart. */
  readonly device: string;
  /** When the identity was last backed up from here, if ever. */
  readonly backedUp: string | null;
}

export const store = new BrowserStore('bezier-collab');

export async function readConfig(): Promise<CollabConfig> {
  const saved = await store.get<Partial<CollabConfig>>('config');
  return {
    enabled: saved?.enabled === true,
    server: saved?.server ?? null,
    name: saved?.name ?? '',
    machine: saved?.machine ?? defaultMachineName(),
    device: saved?.device ?? newDeviceId(),
    backedUp: saved?.backedUp ?? null,
  };
}

export async function writeConfig(config: CollabConfig): Promise<void> {
  await store.set('config', config);
}

/**
 * An initial guess at this machine's name; the browser only says what kind of computer it is.
 */
export function defaultMachineName(agent = globalThis.navigator?.userAgent ?? ''): string {
  if (/iPad/.test(agent)) return 'iPad';
  if (/Mac/.test(agent)) return 'Mac';
  if (/Windows/.test(agent)) return 'Windows PC';
  if (/Linux/.test(agent)) return 'Linux PC';
  return 'This computer';
}

/**
 * Serializes changes to the link list. Each change reads and writes the whole list, so two close
 * together (leaving one shared project while opening another) would otherwise lose one.
 */
let queue: Promise<unknown> = Promise.resolve();
function queued<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export const links: LinkStore = {
  async get(localId) {
    return (await all())[localId];
  },
  set: (link) =>
    queued(async () => {
      await store.set('links', { ...(await all()), [link.localId]: link });
    }),
  remove: (localId) =>
    queued(async () => {
      const { [localId]: _gone, ...rest } = await all();
      await store.set('links', rest);
    }),
  async all() {
    return Object.values(await all());
  },
};

async function all(): Promise<Record<string, ProjectLink>> {
  return (await store.get<Record<string, ProjectLink>>('links')) ?? {};
}
