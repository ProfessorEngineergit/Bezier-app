/**
 * Orbit, pan and zoom as illustrations: a mouse with the active button lit, the modifier keys, and
 * the hand motion. Drawn from the active map (preset plus overrides), so the cards follow the
 * selects below them.
 */

import {
  type DragBinding,
  type NavAction,
  type NavigationPresetId,
  resolveNavigation,
} from '@bezier/renderer';

const ACTIONS: readonly { action: NavAction; label: string }[] = [
  { action: 'orbit', label: 'Orbit' },
  { action: 'pan', label: 'Pan' },
  { action: 'zoom', label: 'Zoom' },
];

/** The hand motion drawn beside the mouse. */
const MOTION: Record<NavAction, string> = {
  orbit: 'M53 17a8.5 8.5 0 1 1-3.4-6.8M50.5 5.5l-.9 4.7 4.6.6',
  pan: 'M44 6v20M34 16h20M44 6l-3 3M44 6l3 3M44 26l-3-3M44 26l3-3M34 16l3-3M34 16l3 3M54 16l-3-3M54 16l-3 3',
  zoom: 'M44 5v22M44 5l-3 4M44 5l3 4M44 27l-3-4M44 27l3-4',
};

function Mouse({ button, wheel }: { button: number | null; wheel: boolean }) {
  return (
    <g>
      <path d="M8 4h16a6 6 0 0 1 6 6v12a10 10 0 0 1-10 10h-4A10 10 0 0 1 6 22V10a6 6 0 0 1 2-6Z" />
      <path d="M6 13h24M18 4v9" />
      {button === 0 && <path className="gesture__lit" d="M8 4h10v9H6v-3a6 6 0 0 1 2-6Z" />}
      {button === 2 && <path className="gesture__lit" d="M18 4h6a6 6 0 0 1 6 6v3H18Z" />}
      {(button === 1 || wheel) && (
        <rect className="gesture__lit" height="7" rx="2" width="4" x="16" y="5" />
      )}
    </g>
  );
}

function keysOf(binding: { shift?: true; ctrl?: true; alt?: true; meta?: true }): string[] {
  const keys: string[] = [];
  if (binding.ctrl) keys.push('Ctrl');
  if (binding.alt) keys.push('Alt');
  if (binding.shift) keys.push('Shift');
  if (binding.meta) keys.push('Cmd');
  return keys;
}

interface Props {
  preset: NavigationPresetId;
  drags: Partial<Record<NavAction, DragBinding>>;
  scrolls: Partial<Record<'plain' | 'shift', NavAction>>;
}

export function NavigationGestures({ preset, drags, scrolls }: Props) {
  const map = resolveNavigation(preset, drags, scrolls);
  return (
    <ul aria-label="How the camera moves" className="gestures">
      {ACTIONS.map(({ action, label }) => {
        const drag = map.drags.find((binding) => binding.action === action);
        const scroll = map.scrolls.find((binding) => binding.action === action);
        const keys = drag !== undefined ? keysOf(drag) : scroll !== undefined ? keysOf(scroll) : [];
        const how =
          drag !== undefined
            ? `${['Left', 'Middle', 'Right'][drag.button]} drag`
            : scroll !== undefined
              ? 'Scroll'
              : 'Not set';
        return (
          <li className="gesture" key={action}>
            <svg aria-hidden="true" className="gesture__picture" viewBox="0 0 58 34">
              <Mouse
                button={drag?.button ?? null}
                wheel={drag === undefined && scroll !== undefined}
              />
              <path className="gesture__motion" d={MOTION[action]} />
            </svg>
            <strong>{label}</strong>
            <span>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
              {keys.length > 0 ? ' + ' : ''}
              {how}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
