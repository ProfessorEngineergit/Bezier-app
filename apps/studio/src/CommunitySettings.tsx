/**
 * Settings → Community: the switch for shared content, the store address, and usage counting.
 * Self-hosted servers are configured here, not on the Community page.
 */

import {
  type CommunityStore,
  checkCommunityStore,
  communityCounting,
  saveDocsToken,
  savedDocsToken,
  setCommunityAddress,
  setCommunityCounting,
  setCommunityOn,
  useCommunityStore,
} from '@bezier/lessons';
import { type FormEvent, useState } from 'react';
import { Group, Row, Switch } from './PrefsControls.js';
import { PluginDevelopment } from './plugins/PluginDevelopment.js';
// The address field and its buttons are styled by Collaboration.
import './collab/collab.css';

export function CommunitySettings() {
  const store = useCommunityStore();
  const [counting, setCounting] = useState(communityCounting);
  return (
    <>
      <Group label="Community">
        <Row
          label="Show what other people share"
          note={
            store.url === ''
              ? 'Bezier Community opens with the launch. A store of your own can be used now, below.'
              : store.on
                ? `Lessons and plugins from ${store.name} are on the Community page.`
                : `Asks ${store.name} what it has. Nothing of yours is sent, and there is no account.`
          }
        >
          <Switch
            checked={store.on}
            disabled={store.url === ''}
            label="Community"
            onChange={setCommunityOn}
          />
        </Row>
        <Row
          label="Count what I finish and install"
          note="A daily total per lesson or plugin, so their authors earn points. Never who did it."
        >
          <Switch
            checked={counting}
            label="Count my contributions"
            onChange={(on) => {
              setCommunityCounting(on);
              setCounting(on);
            }}
          />
        </Row>
      </Group>
      <Address store={store} />
      <PluginDevelopment />
      {store.url !== '' && <Writing docsUrl={`${store.url}/docs`} name={store.name} />}
    </>
  );
}

function Address({ store }: { store: CommunityStore }) {
  const [address, setAddress] = useState(store.custom ? store.url : '');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; ok: boolean } | null>(null);

  async function use(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaid(null);
    try {
      const name = await checkCommunityStore(address);
      setCommunityAddress(address);
      // Entering a store address turns community on.
      setCommunityOn(true);
      setSaid({ text: `${name} answered and is on the Community page now.`, ok: true });
    } catch (problem) {
      setSaid({
        text: problem instanceof Error ? problem.message : 'That store could not be reached.',
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Group
      label="Another store"
      note="For a community store you or someone you know runs. It answers for lessons and plugins at one address."
    >
      <Row
        label="Store address"
        note={
          said?.text ?? (store.custom ? `In use: ${store.url}` : "Empty uses Bezier's own store.")
        }
      >
        <form className="community-address" onSubmit={(event) => void use(event)}>
          <input
            aria-label="Store address"
            autoComplete="url"
            className="prefs-select collab-field collab-field--wide"
            onChange={(event) => setAddress(event.target.value)}
            placeholder="https://community.example.org"
            value={address}
          />
          <button className="prefs-button" disabled={busy || address.trim() === ''} type="submit">
            {busy ? 'Asking…' : 'Use'}
          </button>
          {store.custom && (
            <button
              className="prefs-button"
              onClick={() => {
                setCommunityAddress('');
                setAddress('');
                setSaid(null);
              }}
              type="button"
            >
              Back to Bezier's
            </button>
          )}
        </form>
      </Row>
    </Group>
  );
}

/** The token that lets this user edit a store's wiki. */
function Writing({ docsUrl, name }: { docsUrl: string; name: string }) {
  const [token, setToken] = useState(() => savedDocsToken(docsUrl));
  return (
    <Group
      label="Writing in the wiki"
      note={`Anyone can read the wiki of ${name}. Changing it needs a token, which the owner of the store gives out. A change is live at once, and every version is kept.`}
    >
      <Row label="Token" note="Kept on this device, and sent only to this store.">
        <input
          aria-label="Wiki token"
          autoComplete="off"
          className="prefs-select collab-field collab-field--wide"
          onChange={(event) => {
            setToken(event.target.value);
            saveDocsToken(docsUrl, event.target.value);
          }}
          placeholder="Paste it here"
          type="password"
          value={token}
        />
      </Row>
    </Group>
  );
}
