/**
 * A key pair for browser tests only. A development server (never a release build) accepts this
 * public key when a test sets `window.__bezierInviteKey` (see `apps/studio/src/main.tsx`), so tests
 * can sign their own invitation codes.
 */

import { createPrivateKey, sign } from 'node:crypto';

export const TEST_INVITE_PUBLIC_KEY = 'Tv7PWJi8hFx0Ti4A28g-sy7obOKyLUkGNOXav7WTzDU';

const PRIVATE = createPrivateKey(
  '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIOCcRgFrrQBZ2YCZQjTDteJjo5NWFRoioQIv/HGCXb0s\n-----END PRIVATE KEY-----\n',
);

/** Signs a code with the test key like `scripts/invite.mjs`. `expires` in seconds, 0 = never. */
export function testInviteCode(expires = 0): string {
  const payload = Buffer.alloc(11);
  payload[0] = 1;
  payload.set([0xe2, 0xe2, 0xe2, 0xe2, 0xe2, 0xe2], 1);
  payload.writeUInt32BE(expires, 7);
  const signature = sign(null, Buffer.concat([Buffer.from('bezier-invite-v1'), payload]), PRIVATE);
  return `BZ-${Buffer.concat([payload, signature]).toString('base64url')}`;
}
