/** A small tag marking beta or alpha features, styled the same everywhere. */

import type { Gate } from '../client/channel.js';

const MEANING: Record<Gate, string> = {
  beta: 'New, and still being proved. Part of the beta channel.',
  alpha: 'Not yet used outside the lab. Part of the alpha channel, by invitation.',
};

export function ChannelTag({ gate }: { gate: Gate }) {
  return (
    <span className="beta-tag" data-gate={gate} title={MEANING[gate]}>
      {gate === 'alpha' ? 'Alpha' : 'Beta'}
    </span>
  );
}
