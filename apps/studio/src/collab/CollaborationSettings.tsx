/**
 * Settings → Collaboration. Off: explains collaboration, with the switch and a pointer to running
 * a server. On: connects to a server, then holds the user and machine names and identity backup.
 */

import { useState } from 'react';
import { save } from '../download.js';
import { openExternal } from '../open-external.js';
import { Group, Row, Switch } from '../PrefsControls.js';
import { CollabAccount } from './CollabAccount.js';
import { CollabConnect } from './CollabConnect.js';
import { useCollab } from './CollabProvider.js';
import { SERVER_GUIDE, serverZip } from './server-setup.js';
import './collab.css';

export function CollaborationSettings() {
  const collab = useCollab();
  if (!collab.ready) return null;
  return (
    <>
      {!collab.config.enabled && <Splash />}
      <Group label="Collaboration">
        <Row
          label="Work on projects with others"
          note={
            collab.config.enabled
              ? 'Shared projects appear on the start page. Turning this off keeps them on this device.'
              : 'Needs a Bezier server: yours, or one you are invited to.'
          }
        >
          <Switch
            checked={collab.config.enabled}
            label="Collaboration"
            onChange={(on) => void collab.setEnabled(on)}
          />
        </Row>
      </Group>
      {collab.config.enabled && (collab.connected ? <CollabAccount /> : <CollabConnect />)}
      <ServerSetup />
    </>
  );
}

function Splash() {
  return (
    <section className="collab-splash" aria-label="What collaboration is">
      <div className="collab-splash__stage" aria-hidden="true">
        <img
          className="collab-splash__mark collab-splash__mark--dark"
          src="/brand/bezier-dark.png"
          alt=""
        />
        <img
          className="collab-splash__mark collab-splash__mark--light"
          src="/brand/bezier-light.png"
          alt=""
        />
        <div className="collab-splash__devices">
          <span>Alice · Workshop PC</span>
          <span>Bob · MacBook</span>
          <span>Server · at home</span>
        </div>
      </div>
      <div className="collab-splash__text">
        <h2>Work on one model together.</h2>
        <p className="prefs-lede">
          Share projects through a server you run. Everyone works in the same project at the same
          time and sees each change as it is made. Everyone keeps a full copy and keeps working
          offline.
        </p>
        <ul className="collab-splash__points">
          <li>
            <b>Your server</b>
            <span>A home server or a small rented one. Bezier runs none for you.</span>
          </li>
          <li>
            <b>Encrypted before it leaves</b>
            <span>The server stores your work and cannot read it.</span>
          </li>
          <li>
            <b>Every change kept</b>
            <span>Go back to before any change, or branch from it. See who is in a project.</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

function ServerSetup() {
  const [domain, setDomain] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Group
      label="Run a server"
      note="Docker builds the server from its source; the guide covers a Proxmox container, Tailscale and a rented machine."
    >
      <Row label="Server files" note="Compose, Caddy for HTTPS, and a fresh enrollment code.">
        <span className="collab-inline">
          <input
            aria-label="Server address"
            className="prefs-select collab-field"
            onChange={(event) => setDomain(event.target.value)}
            placeholder="cad.example.org"
            value={domain}
          />
          <button
            className="prefs-button"
            disabled={domain.trim() === ''}
            onClick={() => {
              const name = domain
                .trim()
                .replace(/^https?:\/\//, '')
                .replace(/\/.*$/, '');
              if (!/^[a-z0-9.-]+$/i.test(name)) {
                setProblem('A server address is a name like cad.example.org.');
                return;
              }
              setProblem(null);
              const { enrollment, zip } = serverZip(name);
              void save(zip.slice(), 'bezier-server.zip', 'application/zip').then((where) => {
                if (where !== null) setMade(enrollment);
              });
            }}
            type="button"
          >
            Download
          </button>
        </span>
      </Row>
      {problem !== null && <p className="collab-problem">{problem}</p>}
      {made !== null && (
        <Row
          label="Enrollment code"
          note="Also in the .env file. You need it to create your account."
        >
          <code className="collab-code">{made}</code>
        </Row>
      )}
      <Row label="Server guide" note="Every step, and how to keep a second copy elsewhere.">
        <button className="prefs-button" onClick={() => openExternal(SERVER_GUIDE)} type="button">
          Open guide
        </button>
      </Row>
    </Group>
  );
}
