/**
 * A shared vault on the start page: its projects, who has which open, and its members. Projects
 * open from their live library copy (shared-projects.ts), fetched first if missing.
 */

import type { Member, Present } from '@bezier/sync';
import { PresenceClient } from '@bezier/sync';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentInfo } from '../boot.js';
import { useCollab } from './CollabProvider.js';
import { links } from './collab-store.js';
import { download, isSharedId, type LocalProjects, shareLocal } from './shared-projects.js';
import { VaultPeople } from './VaultPeople.js';

/** What the shared view needs of the library. */
export interface SharedLibrary {
  store: () => LocalProjects | null;
  open: (localId: string) => void;
  refresh: () => void;
  documents: readonly DocumentInfo[];
}

type Tab = 'projects' | 'people';

export function SharedVault({ vaultId, library }: { vaultId: string; library: SharedLibrary }) {
  const collab = useCollab();
  const vault = collab.vault(vaultId);
  // Held only via a read-only link: no account, so no members and no presence.
  const viaLink = collab.isLink(vaultId);
  // The context value changes on every provider render; effects depend on the vault and the
  // connection and read the rest through this.
  const collabRef = useRef(collab);
  collabRef.current = collab;
  const connected = collab.connected;
  const found = vault !== undefined;
  const [tab, setTab] = useState<Tab>('projects');
  const [projects, setProjects] = useState<readonly { id: string; name: string }[] | null>(null);
  const [present, setPresent] = useState<readonly Present[]>([]);
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [sharing, setSharing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the trigger to read again
  useEffect(() => {
    const c = collabRef.current;
    const vault = c.vault(vaultId);
    if (vault === undefined || (!connected && !c.isLink(vaultId))) return;
    const collab = c;
    let live = true;
    void (async () => {
      try {
        const ws = await collab.workspace(vault);
        const [state, info] = await Promise.all([
          ws.state(),
          collab.isLink(vault.id) ? null : collab.vaultClient().get(vault.id),
        ]);
        if (!live) return;
        setMembers(info?.members ?? []);
        setProjects(
          Object.entries(state.tree)
            .map(([id, e]) => ({ id, name: e.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setProblem(null);
      } catch (error) {
        if (live) setProblem(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      live = false;
    };
  }, [vaultId, connected, found, tick]);

  // Who has what open, refreshed while the page is visible. Viewing does not announce presence.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `found` restarts it once the vault list arrives
  useEffect(() => {
    const collab = collabRef.current;
    const vault = collab.vault(vaultId);
    if (vault === undefined || !connected || collab.isLink(vaultId)) return;
    const client = new PresenceClient(collab.vaultClient().conn, vault, collab.config.device);
    let live = true;
    const look = () =>
      void client
        .list()
        .then((p) => live && setPresent(p.filter((x) => !x.self)))
        .catch(() => undefined);
    look();
    const timer = window.setInterval(look, 20_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [vaultId, connected, found]);

  if (vault === undefined) {
    return <p className="collab-problem">This vault is not available on this device.</p>;
  }
  const canWrite = vault.role !== 'reader' && !viaLink;

  const open = async (project: string) => {
    const store = library.store();
    if (store === null) return;
    setProblem(null);
    try {
      const ws = await collab.workspace(vault);
      const { localId, added } = await download(
        await collab.liveChannel(vault, project),
        ws,
        store,
        links,
        { vault: vault.id, project, readOnly: !canWrite },
      );
      if (added) library.refresh();
      library.open(localId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  const share = async (docId: string) => {
    const store = library.store();
    if (store === null) return;
    try {
      const ws = await collab.workspace(vault);
      await shareLocal(ws, (p) => collab.liveChannel(vault, p), store, links, vault.id, docId);
      setSharing(false);
      library.refresh();
      reload();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section aria-label={vault.name} className="library__section collab-shared">
      <header className="library__head collab-shared__head">
        <h1 data-testid="shared-vault-name">{vault.name}</h1>
      </header>

      <nav aria-label="Vault" className="collab-tabs">
        {(viaLink ? (['projects'] as const) : (['projects', 'people'] as const)).map((id) => (
          <button
            aria-current={tab === id ? 'page' : undefined}
            data-active={tab === id ? '' : undefined}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {id === 'projects' ? 'Projects' : 'People'}
          </button>
        ))}
      </nav>

      {problem !== null && (
        <p className="collab-problem" role="alert">
          {problem}
        </p>
      )}

      {tab === 'projects' && (
        <>
          <div className="collab-toolbar">
            <span className="library__count">
              {projects === null
                ? ''
                : projects.length === 1
                  ? '1 project'
                  : `${projects.length} projects`}
            </span>
            {canWrite && (
              <button className="prefs-button" onClick={() => setSharing((s) => !s)} type="button">
                Add a project from this device
              </button>
            )}
          </div>
          {sharing && (
            <div className="collab-picker" data-testid="share-picker">
              {library.documents
                .filter((doc) => !isSharedId(doc.id))
                .map((doc) => (
                  <button key={doc.id} onClick={() => void share(doc.id)} type="button">
                    {doc.name}
                  </button>
                ))}
            </div>
          )}
          {projects !== null && projects.length === 0 ? (
            <p className="collab-empty">No projects here yet.</p>
          ) : (
            <ul className="collab-projects">
              {(projects ?? []).map((p) => {
                const here = present.filter((x) => x.project === p.id);
                return (
                  <li key={p.id}>
                    <button
                      className="collab-project"
                      data-testid="shared-project"
                      onClick={() => void open(p.id)}
                      type="button"
                    >
                      <b>{p.name}</b>
                      <span>
                        {here.length > 0
                          ? here.map((x) => `${x.name} is ${x.mode} on ${x.machine}`).join(' · ')
                          : canWrite
                            ? 'Open'
                            : 'Open to look at'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {tab === 'people' && !viaLink && (
        <VaultPeople members={members} onChanged={reload} vault={vault} />
      )}
      {viaLink && (
        <p className="collab-note">
          Opened through a read-only link. You can look at every project here and change none.{' '}
          <button
            className="prefs-button"
            onClick={() => void collab.closeLink(vault.id)}
            type="button"
          >
            Forget this link
          </button>
        </p>
      )}
    </section>
  );
}
