/**
 * Settings → MCP & Automation: whether an assistant may connect, the pairing code, what it can
 * do, what it did, and the changes it made, each revertible.
 */

import { type FormEvent, useState, useSyncExternalStore } from 'react';
import { Group, Row, Switch } from '../PrefsControls.js';
import '../collab/collab.css';
import {
  addressProblem,
  configureLink,
  DEFAULT_ADDRESS,
  type LinkStatus,
  linkState,
  onLinkChange,
  revertChange,
} from './link.js';

const SAID: Record<LinkStatus, string> = {
  off: 'Off. No assistant can reach this window.',
  connecting: 'Connecting…',
  connected: 'Connected. An assistant can read this window and change the settings listed below.',
  refused: 'The server did not accept this window. Check the pairing code.',
  unreachable: 'No server answers at that address. Start it, and this window connects by itself.',
};

export function McpSettings() {
  const link = useSyncExternalStore(onLinkChange, linkState);
  const [address, setAddress] = useState(link.address);
  const [code, setCode] = useState(link.code);
  const problem = addressProblem(address);

  function use(event: FormEvent) {
    event.preventDefault();
    if (problem === null)
      configureLink({ address: address.trim(), code: code.trim().toUpperCase(), on: true });
  }

  return (
    <>
      <Group
        label="Assistants"
        note="An assistant such as Claude connects through Bezier's MCP server on this computer. It sees what this window shows; nothing is sent anywhere else."
      >
        <Row label="Let assistants connect" note={SAID[link.status]}>
          <Switch
            checked={link.on}
            label="Let assistants connect"
            onChange={(on) => configureLink({ on })}
          />
        </Row>
        <Row
          label="Server and pairing code"
          note={
            problem ??
            'The server prints its code when it starts, and the assistant can tell you it.'
          }
        >
          <form className="community-address" onSubmit={use}>
            <input
              aria-label="MCP server address"
              className="prefs-select collab-field"
              onChange={(event) => setAddress(event.target.value)}
              placeholder={DEFAULT_ADDRESS}
              value={address}
            />
            <input
              aria-label="Pairing code"
              autoComplete="off"
              className="prefs-select collab-field"
              onChange={(event) => setCode(event.target.value)}
              placeholder="ABCD-2345"
              spellCheck={false}
              value={code}
            />
            <button
              className="prefs-button"
              disabled={problem !== null || code.trim() === ''}
              type="submit"
            >
              Connect
            </button>
          </form>
        </Row>
      </Group>
      <Group
        label="What an assistant can do"
        note="It changes the model the way you do, on screen, so every step is in the history and can be undone."
      >
        <Row
          label="Read"
          note="The model and its history, the selection, pictures of the model, the controls on screen, settings, performance."
        >
          <span className="prefs-value">Allowed</span>
        </Row>
        <Row
          label="Change settings"
          note="How Bezier looks and draws. Each change is said on screen and listed below."
        >
          <span className="prefs-value">Allowed</span>
        </Row>
        <Row label="Files, other projects, the network" note="Never through this connection.">
          <span className="prefs-value">Not possible</span>
        </Row>
      </Group>
      {link.changes.length > 0 && (
        <Group label="Changed by an assistant">
          {link.changes.map((change, index) => (
            <Row
              key={`${change.key}-${String(change.to)}-${String(change.from)}`}
              label={`${change.key}: ${String(change.from)} → ${String(change.to)}`}
            >
              <button className="prefs-button" onClick={() => revertChange(index)} type="button">
                Put back
              </button>
            </Row>
          ))}
        </Group>
      )}
      {link.activity.length > 0 && (
        <Group label="Activity" note="What the assistant asked this window, newest first.">
          {link.activity.slice(0, 10).map((entry) => (
            <Row key={entry.at + entry.method} label={entry.method}>
              <span className="prefs-value">
                {new Date(entry.at).toLocaleTimeString()} ·{' '}
                {entry.ok ? `${entry.ms} ms` : 'refused'}
              </span>
            </Row>
          ))}
        </Group>
      )}
    </>
  );
}
