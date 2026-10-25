/**
 * The start page sidebar's Shared section: every vault this device can open, and a way to open an
 * invite or read-only link. Only shown while collaboration is on.
 */

import { parseInviteLink } from '@bezier/sync';
import { ImportIcon, PartIcon } from '@bezier/ui';
import { useState } from 'react';
import { useCollab } from './CollabProvider.js';

export function SharedSection({
  active,
  onOpen,
}: {
  /** The selected vault, or null. */
  active: string | null;
  onOpen: (vault: string) => void;
}) {
  const collab = useCollab();
  const [pasting, setPasting] = useState(false);
  const [link, setLink] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  if (!collab.config.enabled) return null;
  const all = [
    ...collab.vaults.map((vault) => ({ vault, link: false })),
    ...collab.links
      .filter((l) => !collab.vaults.some((v) => v.id === l.id))
      .map((vault) => ({ vault, link: true })),
  ];

  return (
    <section aria-label="Shared" className="library-sidebar__section">
      <header>
        <span>Shared</span>
        <button
          aria-label="Open a shared link"
          onClick={() => setPasting((p) => !p)}
          title="Open a shared link"
          type="button"
        >
          <ImportIcon />
        </button>
      </header>
      {pasting && (
        <form
          className="collab-paste"
          onSubmit={(event) => {
            event.preventDefault();
            setProblem(null);
            // An invite makes this device a member; a read-only link only allows viewing.
            void (
              parseInviteLink(link.trim()) !== null
                ? collab.joinWithInvite(link.trim())
                : collab.openLink(link)
            )
              .then((vault) => {
                void collab.refresh();
                setLink('');
                setPasting(false);
                onOpen(vault.id);
              })
              .catch((error: unknown) =>
                setProblem(error instanceof Error ? error.message : String(error)),
              );
          }}
        >
          <input
            aria-label="Shared link"
            className="prefs-select"
            onChange={(event) => setLink(event.target.value)}
            placeholder="Paste an invite or a read-only link"
            value={link}
          />
          {problem !== null && <small className="collab-problem">{problem}</small>}
        </form>
      )}
      <div className="library-folder-list">
        {all.length === 0 ? (
          <p className="library-folder-list__empty">
            {collab.connected ? 'No shared vaults yet' : 'Connect in Settings to share'}
          </p>
        ) : (
          all.map(({ vault, link: viaLink }) => (
            <button
              className="library-nav__item"
              data-active={active === vault.id ? '' : undefined}
              data-testid="shared-vault"
              key={vault.id}
              onClick={() => onOpen(vault.id)}
              type="button"
            >
              <PartIcon />
              <span>{vault.name}</span>
              {viaLink && <small>View only</small>}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
