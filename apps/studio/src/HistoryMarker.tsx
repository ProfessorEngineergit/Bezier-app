/**
 * The marker below the last built step of a rolled-back history, with a way back to the full
 * model. Steps added meanwhile go above it.
 */
interface Props {
  paused: number;
  onResume: () => void;
}

export function HistoryMarker({ paused, onResume }: Props) {
  return (
    <li className="history-marker" role="status">
      <span>
        Rolled back · {paused === 1 ? '1 later step paused' : `${paused} later steps paused`}
      </span>
      <button onClick={onResume} type="button">
        Roll forward
      </button>
    </li>
  );
}
