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
import { useEffect, useRef, useState } from 'react';
import { CHANNEL_FEATURES } from './channel-features.js';
import { Group, Row, Segmented } from './PrefsControls.js';

const NOTES: Record<Channel, string> = {
  stable: 'Stable is what is finished. The new parts below are not shown.',
  beta: 'Beta is for what is new and still being proved. It may change, and may break.',
  alpha:
    'Alpha is what has not been used outside the lab, and all of it reaches a server. It may change, and may break.',
};

const day = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, { dateStyle: 'long' });

export function ChannelSettings({ version }: { version: string }) {
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
      <Group
        label="Release channel"
        note="Bezier does not update itself yet. New versions come from the website."
      >
        <Row label="Installed version">
          <span className="prefs-value">Bezier {version}</span>
        </Row>
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
