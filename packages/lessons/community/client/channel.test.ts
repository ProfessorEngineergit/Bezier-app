import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { forgetInvite, redeemInvite } from './alpha.js';
import {
  chosenChannel,
  currentChannel,
  onChannelChange,
  reaches,
  readChannel,
  setChannel,
} from './channel.js';
import { INVITE_PREFIX, inviteMessage, setInviteKey } from './invite.js';

const memory = (): Storage => {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  } as Storage;
};

describe('the release channel', () => {
  it('is stable until another is chosen, and stable again when anything else is stored', () => {
    const storage = memory();
    expect(readChannel(storage)).toBe('stable');
    setChannel('beta', storage);
    expect(readChannel(storage)).toBe('beta');
    setChannel('alpha', storage);
    expect(readChannel(storage)).toBe('alpha');
    storage.setItem('bezier.channel', 'nightly');
    expect(readChannel(storage)).toBe('stable');
    setChannel('stable', storage);
    expect(readChannel(storage)).toBe('stable');
  });

  it('includes the lines before it', () => {
    expect(reaches('stable', 'beta')).toBe(false);
    expect(reaches('stable', 'alpha')).toBe(false);
    expect(reaches('beta', 'beta')).toBe(true);
    expect(reaches('beta', 'alpha')).toBe(false);
    expect(reaches('alpha', 'beta')).toBe(true);
    expect(reaches('alpha', 'alpha')).toBe(true);
  });

  it('tells whoever is listening, once per switch', () => {
    const storage = memory();
    let told = 0;
    const stop = onChannelChange(() => {
      told += 1;
    });
    setChannel('beta', storage);
    setChannel('stable', storage);
    stop();
    setChannel('beta', storage);
    expect(told).toBe(2);
  });
});

describe('alpha', () => {
  const pair = generateKeyPairSync('ed25519');
  setInviteKey(String(pair.publicKey.export({ format: 'jwk' }).x));
  const code = (expires: number) => {
    const payload = new Uint8Array(11);
    payload[0] = 1;
    payload.set([9, 9, 9, 9, 9, 9], 1);
    new DataView(payload.buffer).setUint32(7, expires, false);
    const signature = sign(null, inviteMessage(payload), pair.privateKey);
    return INVITE_PREFIX + Buffer.concat([payload, signature]).toString('base64url');
  };

  it('reads as beta without an invitation, however alpha was chosen', async () => {
    forgetInvite();
    // No storage: the choice is held in memory, as when the browser refuses writes.
    setChannel('alpha', null);
    expect(chosenChannel()).toBe('alpha');
    expect(currentChannel()).toBe('beta');
  });

  it('opens with a good invitation, at once, and closes when it is taken away', async () => {
    setChannel('alpha', null);
    let told = 0;
    const stop = onChannelChange(() => {
      told += 1;
    });
    expect((await redeemInvite(code(0))).ok).toBe(true);
    expect(currentChannel()).toBe('alpha');
    forgetInvite();
    expect(currentChannel()).toBe('beta');
    stop();
    expect(told).toBe(2);
  });

  it('does not open for a code that has run out, a wrong one or nonsense', async () => {
    setChannel('alpha', null);
    expect(await redeemInvite(code(1))).toEqual({ ok: false, reason: 'expired' });
    expect(await redeemInvite('BZ-nonsense')).toEqual({ ok: false, reason: 'malformed' });
    expect(currentChannel()).toBe('beta');
  });
});
