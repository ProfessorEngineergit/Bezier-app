import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cleanCode, INVITE_PREFIX, inviteMessage, verifyInvite } from './invite.js';

const pair = generateKeyPairSync('ed25519');
const jwk = pair.publicKey.export({ format: 'jwk' });
const KEY = String(jwk.x);

/** Builds a code like `scripts/invite.mjs`, signed with the test key. */
function codeFor(options: { expires?: number; kind?: number; key?: typeof pair } = {}): string {
  const payload = new Uint8Array(11);
  payload[0] = options.kind ?? 1;
  payload.set([1, 2, 3, 4, 5, 6], 1);
  new DataView(payload.buffer).setUint32(7, options.expires ?? 0, false);
  const signature = sign(null, inviteMessage(payload), (options.key ?? pair).privateKey);
  return INVITE_PREFIX + Buffer.concat([payload, signature]).toString('base64url');
}

const NOW = Date.UTC(2026, 9, 9);
const check = (code: string, revoked: readonly string[] = []) =>
  verifyInvite(code, NOW, KEY, revoked);

describe('an invitation code', () => {
  it('opens when the owner made it, and says when it ends', async () => {
    const soon = Math.floor(NOW / 1000) + 86400;
    expect(await check(codeFor())).toEqual({
      ok: true,
      invite: { id: '010203040506', expires: null },
    });
    expect(await check(codeFor({ expires: soon }))).toEqual({
      ok: true,
      invite: { id: '010203040506', expires: soon },
    });
  });

  it('survives being pasted in lines', async () => {
    const code = codeFor();
    const lines = `${code.slice(0, 40)}\n  ${code.slice(40, 80)}\r\n${code.slice(80)} `;
    expect(cleanCode(lines)).toBe(code);
    expect((await check(lines)).ok).toBe(true);
  });

  it('does not open for a code made with another key', async () => {
    const other = generateKeyPairSync('ed25519');
    expect(await check(codeFor({ key: other }))).toEqual({ ok: false, reason: 'signature' });
  });

  it('does not open when one byte was changed, the end date included', async () => {
    const bytes = Buffer.from(codeFor().slice(INVITE_PREFIX.length), 'base64url');
    bytes[10] = 0xff; // the end date's last byte
    expect(await check(INVITE_PREFIX + bytes.toString('base64url'))).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('has run out at the second it names, and not before', async () => {
    const at = Math.floor(NOW / 1000);
    expect(await check(codeFor({ expires: at }))).toEqual({ ok: false, reason: 'expired' });
    expect((await check(codeFor({ expires: at + 1 }))).ok).toBe(true);
  });

  it('can be withdrawn by its id', async () => {
    expect(await check(codeFor(), ['010203040506'])).toEqual({ ok: false, reason: 'revoked' });
    expect((await check(codeFor(), ['ffffffffffff'])).ok).toBe(true);
  });

  it('is turned away as malformed when it is cut short, has no prefix or another kind', async () => {
    const code = codeFor();
    for (const bad of ['', 'hello', code.slice(0, -4), code.replace('BZ-', ''), `${code}AA`])
      expect(await check(bad), bad).toEqual({ ok: false, reason: 'malformed' });
    expect(await check(codeFor({ kind: 2 }))).toEqual({ ok: false, reason: 'malformed' });
    expect(await check('BZ-!!!')).toEqual({ ok: false, reason: 'malformed' });
  });
});
