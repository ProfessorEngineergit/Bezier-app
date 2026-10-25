/**
 * Collaboration state for the app: whether it is on, the server connection, the identity, the
 * vaults it can open, and the actions that change them. One provider at the root. Off by default,
 * and off means no network, no identity and nothing stored.
 */

import type { CadDocument, Operation } from '@bezier/core';
import { reaches, useChannel } from '@bezier/lessons';
import {
  backupIdentity,
  Connection,
  exportIdentity,
  type Identity,
  importIdentity,
  LiveChannel,
  type LiveStatus,
  newIdentity,
  type OpenedView,
  openViewLink,
  type Present,
  parseInviteLink,
  Repository,
  restoreIdentity,
  VaultClient,
  type VaultHandle,
  Workspace,
} from '@bezier/sync';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { save as saveFile } from '../download.js';
import { type CollabConfig, readConfig, store, writeConfig } from './collab-store.js';
import { type LocalProjects, projectCodec } from './shared-projects.js';

/** The open shared project, as the title bar shows it. */
export interface OpenProject {
  readonly localId: string;
  readonly vault: string;
  readonly readOnly: boolean;
  /** Whether edits are syncing or waiting for the connection. */
  readonly status: LiveStatus;
  /** Other users with it open. */
  readonly present: readonly Present[];
  /** Its id in the vault. */
  readonly project: string;
  /** The model as shown. */
  document(): CadDocument;
  /** Restores the model as a new edit by this user: sent, and undoable. */
  restore(document: CadDocument): Promise<void>;
  /** The local library, for new branches. */
  library(): LocalProjects | null;
  /** Opens another library project in place of this one. */
  open(localId: string): void;
}

export interface Collab {
  /** False until saved state is read; nothing should show as off before then. */
  readonly ready: boolean;
  readonly config: CollabConfig;
  readonly identity: Identity | null;
  /** On, with a server and a known identity. */
  readonly connected: boolean;
  readonly vaults: readonly VaultHandle[];
  /** Vaults opened via a read-only link: view only, no account needed. */
  readonly links: readonly VaultHandle[];
  /** A vault by id, via membership or a read-only link. */
  vault(id: string): VaultHandle | undefined;
  /** Whether a vault is open only via a read-only link. */
  isLink(id: string): boolean;
  openLink(link: string): Promise<VaultHandle>;
  closeLink(vault: string): Promise<void>;
  /** Why the last server connection failed, in a sentence, or null. */
  readonly problem: string | null;
  setEnabled(on: boolean): Promise<void>;
  setProfile(change: { name?: string; machine?: string }): Promise<void>;
  createAccount(server: string, enrollment: string): Promise<void>;
  joinWithInvite(link: string): Promise<VaultHandle>;
  restore(server: string, backup: string, passphrase: string): Promise<void>;
  /** Forgets the server on this device; the identity is kept for reconnecting. */
  disconnect(): Promise<void>;
  backup(passphrase: string): Promise<void>;
  refresh(): Promise<void>;
  vaultClient(): VaultClient;
  /** The vault's projects on its main branch. */
  workspace(vault: VaultHandle): Promise<Workspace>;
  /** A project's live edits, via the account or a read-only link. */
  liveChannel(vault: VaultHandle, project: string): Promise<LiveChannel<CadDocument, Operation>>;
  readonly openProject: OpenProject | null;
  setOpenProject(project: OpenProject | null): void;
}

const CollabContext = createContext<Collab | null>(null);

export function useCollab(): Collab {
  const value = useContext(CollabContext);
  if (value === null) throw new Error('useCollab outside CollabProvider');
  return value;
}

/** Normalizes a typed address ("cad.example.org", "https://cad.example.org/") to an origin. */
export function normalizeServer(text: string): string {
  const trimmed = text.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  // Plain HTTP exposes session tokens in transit; only allowed for a server on this machine.
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('The server needs an https:// address.');
  }
  return url.origin;
}

export function CollabProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<CollabConfig | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [vaults, setVaults] = useState<readonly VaultHandle[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [views, setViews] = useState<readonly { link: string; opened: OpenedView }[]>([]);
  const [openProject, setOpenProject] = useState<OpenProject | null>(null);

  // Reopen previously used read-only links; broken ones (withdrawn or expired) are dropped
  // silently.
  useEffect(() => {
    let live = true;
    void (async () => {
      const saved = (await store.get<string[]>('views')) ?? [];
      const opened: { link: string; opened: OpenedView }[] = [];
      for (const link of saved) {
        try {
          opened.push({ link, opened: await openViewLink(link) });
        } catch {
          // See above.
        }
      }
      if (live) setViews(opened);
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const saved = await readConfig();
      const text = await store.get<string>('identity');
      const id = text === undefined ? null : await importIdentity(text).catch(() => null);
      if (!live) return;
      setConfig(saved);
      setIdentity(id);
      setReady(true);
    })().catch(() => {
      // IndexedDB refused (a private window in some browsers): collaboration stays off.
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const alpha = reaches(useChannel(), 'alpha');
  const stored: CollabConfig = config ?? {
    enabled: false,
    server: null,
    name: '',
    machine: '',
    device: '',
    backedUp: null,
  };
  // Collaboration is alpha: below that channel it is off regardless of the setting, which is kept
  // for when the user is on alpha again.
  const current: CollabConfig = alpha ? stored : { ...stored, enabled: false };
  const connected = current.enabled && current.server !== null && identity !== null;

  const conn = useMemo(
    () =>
      connected && current.server !== null && identity !== null
        ? new Connection(current.server, identity)
        : null,
    [connected, current.server, identity],
  );

  // Update the UI first, then write: a switch waiting on disk feels broken, and the write cannot
  // meaningfully fail where the read worked.
  const save = useCallback(async (next: CollabConfig) => {
    setConfig(next);
    await writeConfig(next);
  }, []);

  const refresh = useCallback(async () => {
    if (conn === null) {
      setVaults([]);
      return;
    }
    try {
      setVaults(await new VaultClient(conn).list());
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }, [conn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ensureIdentity = useCallback(async (): Promise<Identity> => {
    if (identity !== null) return identity;
    const made = await newIdentity();
    await store.set('identity', await exportIdentity(made));
    setIdentity(made);
    return made;
  }, [identity]);

  const viewOf = (id: string) => views.find((v) => v.opened.vault.id === id);
  // Member vaults go through the account; vaults held only via a read-only link use that link's
  // read-only connection.
  const through = (vault: VaultHandle): Connection => {
    // A just-created vault is not in `vaults` until the list is reloaded; anything not held via a
    // link belongs to the account.
    const c = vaults.some((v) => v.id === vault.id)
      ? conn
      : (viewOf(vault.id)?.opened.conn ?? conn);
    if (c === null || c === undefined) throw new Error('Not connected to a server.');
    return c;
  };

  const value: Collab = {
    ready,
    config: current,
    identity,
    connected,
    vaults,
    links: views.map((v) => v.opened.vault),
    vault: (id) => vaults.find((v) => v.id === id) ?? viewOf(id)?.opened.vault,
    isLink: (id) => !vaults.some((v) => v.id === id) && viewOf(id) !== undefined,
    openLink: async (link) => {
      const opened = await openViewLink(link.trim());
      const others = views.filter((v) => v.opened.vault.id !== opened.vault.id);
      const next = [...others, { link: link.trim(), opened }];
      setViews(next);
      await store.set(
        'views',
        next.map((v) => v.link),
      );
      return opened.vault;
    },
    closeLink: async (id) => {
      const next = views.filter((v) => v.opened.vault.id !== id);
      setViews(next);
      await store.set(
        'views',
        next.map((v) => v.link),
      );
    },
    problem,
    setEnabled: async (on) => save({ ...current, enabled: on }),
    setProfile: async (change) => {
      const next = { ...current, ...change };
      await save(next);
      if (change.name !== undefined && conn !== null) {
        // Names are sealed per vault, so each vault gets its own copy.
        const client = new VaultClient(conn);
        for (const vault of vaults) await client.setDisplayName(vault, change.name).catch(() => {});
      }
    },
    createAccount: async (server, enrollment) => {
      const origin = normalizeServer(server);
      const id = await ensureIdentity();
      const c = new Connection(origin, id);
      // Idempotent for the same keys: no need to ask first whether this identity is known.
      await c.register({ enrollment: enrollment.trim() });
      await save({ ...current, enabled: true, server: origin });
    },
    joinWithInvite: async (link) => {
      const parsed = parseInviteLink(link);
      if (parsed === null) throw new Error('That is not an invite link.');
      const origin = normalizeServer(new URL(link.trim()).origin);
      const id = await ensureIdentity();
      const vault = await new VaultClient(new Connection(origin, id)).join(
        link,
        current.name || undefined,
      );
      await save({ ...current, enabled: true, server: origin });
      return vault;
    },
    restore: async (server, backup, passphrase) => {
      const origin = normalizeServer(server);
      const id = await restoreIdentity(backup, passphrase);
      if (!(await new Connection(origin, id).isRegistered())) {
        throw new Error('This server does not know that identity. Check the address.');
      }
      await store.set('identity', await exportIdentity(id));
      setIdentity(id);
      await save({ ...current, enabled: true, server: origin, backedUp: new Date().toISOString() });
    },
    disconnect: async () => save({ ...current, server: null }),
    backup: async (passphrase) => {
      if (identity === null) throw new Error('There is no identity on this device yet.');
      const file = await backupIdentity(identity, passphrase);
      const name = `bezier-identity-${identity.userId.slice(0, 8)}.json`;
      // Only a completed save counts as a backup, not a cancelled save panel.
      if ((await saveFile(file, name, 'application/json')) === null) return;
      await save({ ...current, backedUp: new Date().toISOString() });
    },
    refresh,
    vaultClient: () => {
      if (conn === null) throw new Error('Not connected to a server.');
      return new VaultClient(conn);
    },
    workspace: async (vault) => new Workspace(new Repository(through(vault), vault, store), 'main'),
    liveChannel: (vault, project) => LiveChannel.open(through(vault), vault, project, projectCodec),
    openProject,
    setOpenProject,
  };

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}
