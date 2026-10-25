/**
 * Nib's animation channels: each joint angle, the eyelids and the mouth is a named value in degrees
 * or metres, matching the film's rig. Behaviours only set targets and springs move the values, so
 * no clips are needed and anything can interrupt anything.
 */

export const CHANNELS = [
  // Body: pitch > 0 leans forward; yaw turns the whole figure; pos* is its place, in metres.
  'bodyPitch',
  'bodyRoll',
  'bodyTwist',
  'bodyZ',
  'neckNod',
  'neckTilt',
  'neckTurn',
  'yaw',
  'posX',
  'posY',
  'posZ',
  // Face: lid tilt in degrees; `lidClose` 0 open to 1 shut (below 0 wide open); `lidCloseL` and
  // `lidCloseR` close one eye further (wink); `cheek` lifts the lower lid into a smile; mouth
  // smile, width and thickness are around 1.
  'lidTilt',
  'lidClose',
  'lidCloseL',
  'lidCloseR',
  'cheek',
  'smile',
  'mouthWidth',
  'mouthThick',
  'glow',
  // Arms: forward, outward, twist, elbow bend, elbow outward. Left is Nib's left.
  'armLFwd',
  'armLOut',
  'armLTwist',
  'armLBend',
  'armLBendOut',
  'armRFwd',
  'armROut',
  'armRTwist',
  'armRBend',
  'armRBendOut',
  // Legs: swing, spread and the piston's extension in metres.
  'legLSwing',
  'legLSpread',
  'legLExt',
  'legRSwing',
  'legRSpread',
  'legRExt',
  'finger',
] as const;

export type Channel = (typeof CHANNELS)[number];
export type Pose = Partial<Record<Channel, number>>;

export const CHANNEL_INDEX = Object.fromEntries(CHANNELS.map((name, i) => [name, i])) as Record<
  Channel,
  number
>;

/** Rest value of every channel. */
const RESTING: Pose = {
  armLFwd: 4,
  armLOut: 10,
  armLBend: 14,
  armLBendOut: 4,
  armRFwd: 4,
  armROut: 10,
  armRBend: 14,
  armRBendOut: 4,
  lidClose: 0.06,
  smile: 1,
  mouthWidth: 1,
  mouthThick: 1,
  glow: 1,
  finger: 18,
};

export function rest(channel: Channel): number {
  return RESTING[channel] ?? 0;
}

/** Channel values in one typed array, so a frame allocates nothing. */
export class Values {
  readonly data = new Float32Array(CHANNELS.length);

  get(channel: Channel): number {
    return this.data[CHANNEL_INDEX[channel]] ?? 0;
  }

  set(channel: Channel, value: number): void {
    this.data[CHANNEL_INDEX[channel]] = value;
  }

  add(channel: Channel, value: number): void {
    this.data[CHANNEL_INDEX[channel]] = this.get(channel) + value;
  }

  /** Resets every channel to rest. */
  toRest(): void {
    for (let i = 0; i < CHANNELS.length; i++) this.data[i] = rest(CHANNELS[i] ?? 'bodyPitch');
  }
}
