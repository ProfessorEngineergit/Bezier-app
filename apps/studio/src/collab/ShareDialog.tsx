/**
 * Sharing a project from the start page: pick the audience, and the
 * project is live for them from then on (ADR 0015). It goes into a new vault named after it
 * unless an existing one is picked, whose members are then shown for inviting.
 */

import type { Member, VaultHandle } from '@bezier/sync';
import { useState } from 'react';
import type { DocumentInfo } from '../boot.js';
import { LibraryDialog } from '../LibraryDialogs.js';
import { useCollab } from './CollabProvider.js';
import { links } from './collab-store.js';
import { type LocalProjects, shareLocal } from './shared-projects.js';
import { VaultPeople } from './VaultPeople.js';

export function ShareDialog({
  doc,
  store,
  onShared,
  onClose,
}: {
  doc: DocumentInfo;
  store: () => LocalProjects | null;
  /** The library changed: the project has a new id. */
  onShared: () => void;
  onClose: () => void;
}) {
  const collab = useCollab();
  const writable = collab.vaults.filter((v) => v.role !== 'reader');
  const [where, setWhere] = useState<string>('new');
  const [shared, setShared] = useState<{ vault: VaultHandle; members: readonly Member[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const share = async () => {
    const library = store();
    if (library === null) return;
    setBusy(true);
    setProblem(null);
    try {
      const client = collab.vaultClient();
      const vault =
        where === 'new'
          ? await client.create(doc.name, collab.config.name || undefined)
          : writable.find((v) => v.id === where);
      if (vault === undefined) throw new Error('That vault is not available any more.');
      const ws = await collab.workspace(vault);
      await shareLocal(ws, (p) => collab.liveChannel(vault, p), library, links, vault.id, doc.id);
      await collab.refresh();
      onShared();
      setShared({ vault, members: (await client.get(vault.id)).members });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const members = async () => {
    if (shared === null) return;
    const info = await collab.vaultClient().get(shared.vault.id);
    setShared({ vault: shared.vault, members: info.members });
  };

  return (
    <LibraryDialog
      label="Share project"
      onClose={onClose}
      restoreFocusTo={null}
      title={shared === null ? `Share “${doc.name}”` : `“${doc.name}” is shared`}
    >
      <div className="collab-share">
        {!collab.connected ? (
          <p className="library-dialog__note">
            Connect to a server in Settings, under Collaboration, to share projects.
          </p>
        ) : shared === null ? (
          <>
            <p className="library-dialog__note">
              Everyone it is shared with sees each change as it is made, and can work in it at the
              same time.
            </p>
            <div className="library-dialog__destinations">
              <button
                aria-pressed={where === 'new'}
                data-current={where === 'new' ? '' : undefined}
                onClick={() => setWhere('new')}
                type="button"
              >
                <span>On its own</span>
                <small>Invite people to this project</small>
              </button>
              {writable.map((vault) => (
                <button
                  aria-pressed={where === vault.id}
                  data-current={where === vault.id ? '' : undefined}
                  key={vault.id}
                  onClick={() => setWhere(vault.id)}
                  type="button"
                >
                  <span>{vault.name}</span>
                  <small>Everyone in this vault</small>
                </button>
              ))}
            </div>
            {problem !== null && (
              <p className="collab-problem" role="alert">
                {problem}
              </p>
            )}
            <div className="library-dialog__actions">
              <button onClick={onClose} type="button">
                Cancel
              </button>
              <button disabled={busy} onClick={() => void share()} type="button">
                {busy ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </>
        ) : (
          <>
            <VaultPeople
              members={shared.members}
              onChanged={() => void members()}
              vault={shared.vault}
            />
            <div className="library-dialog__actions">
              <button onClick={onClose} type="button">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </LibraryDialog>
  );
}
