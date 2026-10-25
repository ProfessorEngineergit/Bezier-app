/**
 * Connects this device to a server in one of three ways: an invite link, a new account with the
 * server's enrollment code, or an identity restored from a backup. Name and machine are asked for
 * first because others will see them.
 */

import { useState } from 'react';
import { Group, Row } from '../PrefsControls.js';
import { useCollab } from './CollabProvider.js';

type Way = 'invite' | 'account' | 'backup';

const WAYS: readonly (readonly [Way, string, string])[] = [
  ['invite', 'I have an invite link', 'Someone shared a vault with you.'],
  ['account', 'Create an account', 'With your server’s address and its enrollment code.'],
  ['backup', 'Restore from a backup', 'Use the identity you made on another device.'],
];

export function CollabConnect() {
  const collab = useCollab();
  const [way, setWay] = useState<Way | null>(null);
  const [server, setServer] = useState('');
  const [secret, setSecret] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (way === 'invite') await collab.joinWithInvite(secret);
      else if (way === 'account') await collab.createAccount(server, secret);
      else if (way === 'backup') {
        if (file === null) throw new Error('Choose the backup file.');
        await collab.restore(server, await file.text(), secret);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Profile />
      <Group label="Connect to a server">
        <div className="prefs-actions collab-ways">
          {WAYS.map(([id, title, detail]) => (
            <button
              aria-pressed={way === id}
              className="prefs-action"
              data-active={way === id ? '' : undefined}
              key={id}
              onClick={() => {
                setWay(id);
                setProblem(null);
                setSecret('');
              }}
              type="button"
            >
              <b>{title}</b>
              <span>{detail}</span>
            </button>
          ))}
        </div>
      </Group>
      {way !== null && (
        <form
          className="collab-form"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <Group label={WAYS.find(([id]) => id === way)?.[1] ?? ''}>
            {way !== 'invite' && (
              <Row label="Server" note="Its address, like cad.example.org.">
                <input
                  aria-label="Server"
                  autoComplete="url"
                  className="prefs-select collab-field"
                  onChange={(event) => setServer(event.target.value)}
                  placeholder="cad.example.org"
                  required
                  value={server}
                />
              </Row>
            )}
            {way === 'invite' && (
              <Row label="Invite link" note="The whole link, as it was sent to you.">
                <input
                  aria-label="Invite link"
                  className="prefs-select collab-field collab-field--wide"
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder="https://…/#join=…"
                  required
                  value={secret}
                />
              </Row>
            )}
            {way === 'account' && (
              <Row label="Enrollment code" note="From whoever runs the server.">
                <input
                  aria-label="Enrollment code"
                  className="prefs-select collab-field"
                  onChange={(event) => setSecret(event.target.value)}
                  required
                  type="password"
                  value={secret}
                />
              </Row>
            )}
            {way === 'backup' && (
              <>
                <Row label="Backup file">
                  <input
                    accept=".json,application/json"
                    aria-label="Backup file"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    required
                    type="file"
                  />
                </Row>
                <Row label="Passphrase">
                  <input
                    aria-label="Passphrase"
                    className="prefs-select collab-field"
                    onChange={(event) => setSecret(event.target.value)}
                    required
                    type="password"
                    value={secret}
                  />
                </Row>
              </>
            )}
          </Group>
          {problem !== null && (
            <p className="collab-problem" role="alert">
              {problem}
            </p>
          )}
          <div className="collab-submit">
            <button className="collab-primary" disabled={busy} type="submit">
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

/** The user's name and this machine's, as others see them. */
export function Profile() {
  const collab = useCollab();
  const [name, setName] = useState(collab.config.name);
  const [machine, setMachine] = useState(collab.config.machine);
  return (
    <Group
      label="You"
      note="Shown to the people you share with, as in “Alice is editing this on Workshop PC”."
    >
      <Row label="Your name">
        <input
          aria-label="Your name"
          className="prefs-select collab-field"
          onBlur={() =>
            name.trim() !== collab.config.name && void collab.setProfile({ name: name.trim() })
          }
          onChange={(event) => setName(event.target.value)}
          placeholder="Alice"
          value={name}
        />
      </Row>
      <Row
        label="This machine"
        note="Your browser does not say what this computer is called. Name it."
      >
        <input
          aria-label="This machine"
          className="prefs-select collab-field"
          onBlur={() =>
            machine.trim() !== collab.config.machine &&
            void collab.setProfile({ machine: machine.trim() || collab.config.machine })
          }
          onChange={(event) => setMachine(event.target.value)}
          value={machine}
        />
      </Row>
    </Group>
  );
}
