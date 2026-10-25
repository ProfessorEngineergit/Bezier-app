/**
 * Collaboration settings once connected: identity, server, identity backup and vaults. Vault
 * contents (projects, history, members) are on the start page under Shared.
 */

import { useEffect, useState } from 'react';
import { Group, Row } from '../PrefsControls.js';
import { Profile } from './CollabConnect.js';
import { useCollab } from './CollabProvider.js';

const ROLE = { reader: 'Can view', writer: 'Can edit', admin: 'Admin' } as const;

export function CollabAccount() {
  const collab = useCollab();
  const [health, setHealth] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newVault, setNewVault] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const server = collab.config.server ?? '';

  useEffect(() => {
    let live = true;
    fetch(`${server}/v1/health`)
      .then((r) => r.json() as Promise<{ ok: boolean; version: string; replicas: unknown[] }>)
      .then((h) => {
        if (!live) return;
        const copies = h.replicas.length === 1 ? 'one copy' : `${h.replicas.length} copies`;
        setHealth(
          `Version ${h.version}, ${copies}, ${h.ok ? 'all healthy' : 'one needs attention'}`,
        );
      })
      .catch(
        () => live && setHealth('Not reachable right now. Your projects stay on this device.'),
      );
    return () => {
      live = false;
    };
  }, [server]);

  const attempt = async (action: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <Profile />
      <Group label="Server">
        <Row label={server} note={health ?? 'Checking…'}>
          <button
            className="prefs-button prefs-button--danger"
            onClick={() => void collab.disconnect()}
            type="button"
          >
            Disconnect
          </button>
        </Row>
        <Row
          label="Your id"
          note="Give it to someone who wants to add you to a vault. It is not secret."
        >
          <span className="collab-inline">
            <code className="collab-code" data-testid="collab-user-id">
              {collab.identity?.userId}
            </code>
            <button
              className="prefs-button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(collab.identity?.userId ?? '')
                  .then(() => setCopied(true))
              }
              type="button"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </span>
        </Row>
      </Group>
      <Group
        label="Backup"
        note="Your identity is the only key to your vaults. Without a backup, losing this device means losing access, and nobody can give it back."
      >
        <Row
          label={
            collab.config.backedUp === null
              ? 'Not backed up from this device'
              : `Backed up ${new Date(collab.config.backedUp).toLocaleDateString()}`
          }
          note="Protected by a passphrase of at least 10 characters."
        >
          <span className="collab-inline">
            <input
              aria-label="Backup passphrase"
              className="prefs-select collab-field"
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Passphrase"
              type="password"
              value={passphrase}
            />
            <button
              className="prefs-button"
              disabled={passphrase.length < 10}
              onClick={() =>
                void attempt(async () => {
                  await collab.backup(passphrase);
                  setPassphrase('');
                })
              }
              type="button"
            >
              Download backup
            </button>
          </span>
        </Row>
      </Group>
      <Group
        label="Vaults"
        note="A vault is what you share: everyone in it sees every project in it."
      >
        {collab.vaults.map((vault) => (
          <Row key={vault.id} label={vault.name}>
            <span className="prefs-value">{ROLE[vault.role]}</span>
          </Row>
        ))}
        <Row label="New vault">
          <span className="collab-inline">
            <input
              aria-label="New vault name"
              className="prefs-select collab-field"
              onChange={(event) => setNewVault(event.target.value)}
              placeholder="Workshop"
              value={newVault}
            />
            <button
              className="prefs-button"
              disabled={newVault.trim() === ''}
              onClick={() =>
                void attempt(async () => {
                  await collab
                    .vaultClient()
                    .create(newVault.trim(), collab.config.name || undefined);
                  setNewVault('');
                  await collab.refresh();
                })
              }
              type="button"
            >
              Create
            </button>
          </span>
        </Row>
      </Group>
      {(problem ?? collab.problem) !== null && (
        <p className="collab-problem" role="alert">
          {problem ?? collab.problem}
        </p>
      )}
    </>
  );
}
