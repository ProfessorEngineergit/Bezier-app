/**
 * Critically damped springs: each channel follows its target without overshoot. Uses the
 * closed-form solution, exact for any time step, so slow or fast frames stay stable.
 */

import { CHANNEL_INDEX, CHANNELS, type Values } from './channels.js';

/** Natural frequency in radians per second: the eyes are quick, the body is lazy. */
const FREQUENCY = new Float32Array(CHANNELS.length).fill(14);
for (const name of CHANNELS) {
  const i = CHANNEL_INDEX[name];
  if (name === 'lidClose') FREQUENCY[i] = 38;
  else if (name === 'smile' || name === 'mouthWidth' || name === 'mouthThick' || name === 'glow')
    FREQUENCY[i] = 18;
  else if (name.startsWith('armL') || name.startsWith('armR')) FREQUENCY[i] = 16;
}

/**
 * Moves `value` toward `target` by `dt` seconds. Returns how many channels are still moving, so
 * the caller can skip drawing the next frame.
 */
export function stepSprings(value: Values, velocity: Values, target: Values, dt: number): number {
  let moving = 0;
  for (let i = 0; i < CHANNELS.length; i++) {
    const w = FREQUENCY[i] ?? 14;
    const goal = target.data[i] ?? 0;
    const x = (value.data[i] ?? 0) - goal;
    const v = velocity.data[i] ?? 0;
    const k = v + w * x;
    const decay = Math.exp(-w * dt);
    value.data[i] = goal + (x + k * dt) * decay;
    velocity.data[i] = (v - w * k * dt) * decay;
    if (Math.abs(velocity.data[i] ?? 0) > 0.02 || Math.abs((value.data[i] ?? 0) - goal) > 0.002)
      moving++;
  }
  return moving;
}
