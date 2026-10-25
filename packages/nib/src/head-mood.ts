/**
 * Island moods (`island/machine.ts`) on the 3D head: channel offsets added on top of idle and
 * reactions, so blinks and glances continue. Same names as the flat face's moods.
 */

import type { Channel } from './channels.js';

export type HeadMood =
  | 'rest'
  | 'sleepy'
  | 'focused'
  | 'thinking'
  | 'curious'
  | 'happy'
  | 'proud'
  | 'worried'
  | 'oops'
  | 'strained';

export type Offsets = Partial<Record<Channel, number>>;

export const MOODS: Readonly<Record<HeadMood, Offsets>> = {
  rest: {},
  sleepy: { neckNod: 9, lidClose: 0.55 },
  focused: { lidClose: 0.25, lidTilt: -8, neckNod: -3 },
  thinking: { neckTilt: 10, neckTurn: 12, neckNod: -4, lidClose: 0.12 },
  curious: { neckTilt: 7, lidClose: -0.12, neckNod: -3 },
  happy: { cheek: 1, smile: 0.4, neckNod: -3, lidClose: 0.1 },
  proud: { cheek: 0.9, smile: 0.35, neckNod: -6, lidClose: 0.15 },
  worried: { smile: -0.7, lidTilt: 10, neckNod: 5, neckTilt: -4 },
  oops: { lidClose: -0.25, smile: -0.6, mouthWidth: -0.4, neckNod: -4, neckTilt: 6 },
  strained: { lidClose: 0.4, lidTilt: 12, smile: -0.35, neckNod: 7, neckTilt: -6 },
};
