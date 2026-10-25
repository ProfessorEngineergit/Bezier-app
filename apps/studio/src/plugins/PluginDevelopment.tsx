/**
 * Settings → Community → Writing a plugin: the dev server address (`bezier-plugin dev`). When
 * set, that plugin runs in the editor and restarts on every save; cleared, it is gone, since it
 * was never installed.
 */

import { type FormEvent, useState } from 'react';
import { Group, Row } from '../PrefsControls.js';
import { devAddressProblem, setDevPluginAddress, useDevPluginAddress } from './dev-plugin.js';

export function PluginDevelopment() {
  const address = useDevPluginAddress();
  const [typed, setTyped] = useState(address === '' ? 'http://127.0.0.1:5199' : address);
  const problem = devAddressProblem(typed);

  function use(event: FormEvent) {
    event.preventDefault();
    if (problem === null) setDevPluginAddress(typed.trim());
  }

  return (
    <Group
      label="Writing a plugin"
      note="Run `npx bezier-plugin dev` in your plugin's folder. Its plugin runs here in the same sandbox as any other, and again each time you save. Plugins run in the browser for now, not in the desktop app."
    >
      <Row
        label="Development server"
        note={
          address === ''
            ? (problem ?? 'Not loading a plugin in development.')
            : `Loading from ${address}.`
        }
      >
        <form className="community-address" onSubmit={use}>
          <input
            aria-label="Development server address"
            className="prefs-select collab-field"
            onChange={(event) => setTyped(event.target.value)}
            value={typed}
          />
          <button className="prefs-button" disabled={problem !== null} type="submit">
            Load
          </button>
          {address !== '' && (
            <button className="prefs-button" onClick={() => setDevPluginAddress('')} type="button">
              Stop
            </button>
          )}
        </form>
      </Row>
    </Group>
  );
}
