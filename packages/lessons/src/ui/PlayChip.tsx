import './play-chip.css';
import { Icon } from './Icon.js';

/**
 * The play indicator on a lesson picture: a rimmed disc over a dark tint. It fills and lifts when
 * the card is hovered.
 */
export function PlayChip({ size = 44, persistent }: { size?: 36 | 44 | 56; persistent?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="lessons-playchip"
      data-persistent={persistent ? '' : undefined}
      style={{ ['--chip' as string]: `${size}px` }}
    >
      <Icon name="play" size={size >= 56 ? 24 : 20} />
    </span>
  );
}
