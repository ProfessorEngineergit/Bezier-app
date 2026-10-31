/**
 * Settings → Updates: the release channel and what the other channels add. Switching takes effect
 * without a restart. Alpha requires an invitation code, checked on this device.
 */

import {
  type Channel,
  ChannelTag,
  chosenChannel,
  forgetInvite,
  inviteFailureText,
  redeemInvite,
  setChannel,
  useChannel,
  useInvite,
} from '@bezier/lessons';
import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { CHANNEL_FEATURES } from './channel-features.js';
import { openExternal } from './open-external.js';
import { Group, Row, Segmented, Switch } from './PrefsControls.js';
import type { AppPrefs } from './preferences.js';
import { checkForUpdate, useUpdateState } from './use-update-check.js';

const NOTES: Record<Channel, string> = {
  stable: 'Stable is what is finished. The new parts below are not shown.',
  beta: 'Beta is for what is new and still being proved. It may change, and may break.',
  alpha:
    'Alpha is what has not been used outside the lab, and all of it reaches a server. It may change, and may break.',
};

const day = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, { dateStyle: 'long' });

const NEWEST: Record<string, string> = {
  idle: 'Not looked yet.',
  checking: 'Looking…',
  current: 'This is the newest version.',
  failed: 'Could not reach GitHub. Try again later.',
};

/** Looking for a newer version. The desktop app only: the browser always loads the newest. */
function UpdateCheck({
  version,
  prefs,
  onCheck,
}: {
  version: string;
  prefs: AppPrefs;
  onCheck: (value: boolean) => void;
}) {
  const update = useUpdateState();
  if (!isTauri()) {
    return (
      <Group label="Updates" note="This is the browser version. Reload the page to get the newest.">
        <Row label="Installed version">
          <span className="prefs-value">Bezier {version}</span>
        </Row>
      </Group>
    );
  }
  const release = update.release;
  return (
    <>
      <Group
        label="Updates"
        note="Looking asks api.github.com for the newest release. GitHub sees your address and the name of the app; nothing about you or your projects is sent."
      >
        <Row label="Installed version">
          <span className="prefs-value">Bezier {version}</span>
        </Row>
        <Row
          label="Look at start"
          note="Once, when the app opens. A newer version is mentioned, not installed."
        >
          <Switch
            checked={prefs.checkForUpdates}
            label="Look for updates at start"
            onChange={onCheck}
          />
        </Row>
        <Row
          label="Newest version"
          note={
            update.status === 'available' && release !== null
              ? `Bezier ${release.version} is out.`
              : (NEWEST[update.status] ?? '')
          }
        >
          <button
            className="prefs-button"
            disabled={update.status === 'checking'}
            onClick={() => void checkForUpdate(version)}
            type="button"
          >
            Look now
          </button>
        </Row>
        {update.status === 'available' && release !== null && (
          <Row
            label={release.name}
            note="Opens the release page. Download the installer for your system and run it over this one."
          >
            <button
              className="prefs-button"
              onClick={() => openExternal(release.url)}
              type="button"
            >
              Download
            </button>
          </Row>
        )}
      </Group>
      {update.status === 'available' && release !== null && release.notes !== '' && (
        <Group label="What changed">
          <pre className="prefs-notes">{release.notes}</pre>
        </Group>
      )}
    </>
  );
}

export function ChannelSettings({
  version,
  prefs,
  onCheck,
}: {
  version: string;
  prefs: AppPrefs;
  onCheck: (value: boolean) => void;
}) {
  const channel = useChannel();
  const invite = useInvite();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // Focus the code field as soon as it appears.
  useEffect(() => {
    if (asking) field.current?.focus();
  }, [asking]);

  const choose = (next: Channel) => {
    if (next === 'alpha' && invite === null) {
      // Alpha needs a code first, so ask for it instead of switching.
      setAsking(true);
      return;
    }
    setAsking(false);
    setSaid(null);
    setChannel(next);
  };

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await redeemInvite(code);
    setBusy(false);
    if (!result.ok) {
      setSaid(inviteFailureText(result.reason));
      return;
    }
    setCode('');
    setSaid(null);
    setAsking(false);
    setChannel('alpha');
  };

  const remove = () => {
    // Leaving alpha with the invitation drops to beta, where nothing is lost.
    const wasAlpha = chosenChannel() === 'alpha';
    forgetInvite();
    if (wasAlpha) setChannel('beta');
  };

  // While asking for a code the switch shows the chosen channel; otherwise the actual one.
  const shown: Channel = asking ? 'alpha' : channel;

  return (
    <>
      <UpdateCheck onCheck={onCheck} prefs={prefs} version={version} />
      <Group
        label="Release channel"
        note="Bezier does not install updates by itself. Which parts you see depends on the channel."
      >
        <Row label="Channel" note={NOTES[channel]}>
          <Segmented<Channel>
            name="release-channel"
            onChange={choose}
            options={[
              ['stable', 'Stable'],
              ['beta', 'Beta'],
              ['alpha', 'Alpha'],
            ]}
            value={shown}
          />
        </Row>
        {invite !== null ? (
          <Row
            label="Invitation"
            note={
              invite.expires === null
                ? 'Good for alpha, with no end date.'
                : `Good for alpha until ${day(invite.expires)}.`
            }
          >
            <button className="prefs-button" onClick={remove} type="button">
              Remove invitation
            </button>
          </Row>
        ) : (
          asking && (
            <Row
              label="Invitation code"
              note={
                said ?? 'Alpha is by invitation. Paste the code you were sent; it starts with BZ-.'
              }
            >
              <form className="community-address" onSubmit={(event) => void unlock(event)}>
                <input
                  aria-label="Invitation code"
                  autoComplete="off"
                  className="prefs-select collab-field collab-field--wide"
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="BZ-…"
                  ref={field}
                  spellCheck={false}
                  value={code}
                />
                <button
                  className="prefs-button"
                  disabled={busy || code.trim() === ''}
                  type="submit"
                >
                  {busy ? 'Checking…' : 'Unlock'}
                </button>
              </form>
            </Row>
          )
        )}
      </Group>
      <Group
        label="What is in alpha"
        note="These are shown on the alpha channel, with an Alpha mark, and nowhere else."
      >
        {CHANNEL_FEATURES.map((feature) => (
          <Row key={feature.id} label={feature.name} note={feature.summary}>
            <ChannelTag gate={feature.gate} />
          </Row>
        ))}
      </Group>
    </>
  );
}
