/**
 * A one-time intro on first opening Community or Plugins: what can be earned, and that counting is
 * on. The switch stays available afterwards.
 */

import { useState } from 'react';
import installs from '../renders/installs-sapphire.png';
import streak from '../renders/streak-emerald.png';
import teacher from '../renders/teacher-diamond.png';
import { countingEnabled, introSeen, markIntroSeen, setCounting } from './counting.js';
import { LEVELS, POINTS } from './points.js';
import './intro.css';

const EXAMPLES = [
  'lesson-published',
  'plugin-published',
  'lesson-finished-by-someone',
  'star-received',
  'lesson-finished',
] as const;

export function RecognitionIntro() {
  const [open, setOpen] = useState(() => !introSeen());
  const [counting, setCountingState] = useState(() => countingEnabled());

  if (!open) return null;

  const close = () => {
    markIntroSeen();
    setOpen(false);
  };

  return (
    <div className="ri-scrim">
      <section className="ri-sheet" role="dialog" aria-modal="true" aria-labelledby="ri-title">
        <div className="ri-badges" aria-hidden="true">
          <img src={installs} alt="" />
          <img src={teacher} alt="" className="ri-badges__hero" />
          <img src={streak} alt="" />
        </div>
        <h2 id="ri-title" className="ri-title">
          Your contributions count
        </h2>
        <p className="ri-lead">
          You earn points and badges for what you share and what you learn. They are awarded
          automatically, shown on your profile, and yours to share.
        </p>
        <ul className="ri-points">
          {EXAMPLES.map((key) => (
            <li key={key}>
              <span>{POINTS[key].text}</span>
              <strong>+{POINTS[key].points}</strong>
            </li>
          ))}
        </ul>
        <p className="ri-levels">{LEVELS.map((level) => level.name).join(' → ')}</p>
        <label className="ri-switch cl-switch">
          <input
            type="checkbox"
            role="switch"
            aria-checked={counting}
            checked={counting}
            onChange={(event) => {
              setCounting(event.target.checked);
              setCountingState(event.target.checked);
            }}
          />
          <span className="cl-switch__track" aria-hidden="true" />
          <span className="cl-source__text">
            <span className="cl-source__name">Count my contributions</span>
            <span className="ri-switch__note">
              Only daily totals per lesson or plugin are counted, never who did what.
            </span>
          </span>
        </label>
        <div className="ri-actions">
          <button type="button" className="lessons-button lessons-button--primary" onClick={close}>
            Start earning
          </button>
        </div>
      </section>
    </div>
  );
}
