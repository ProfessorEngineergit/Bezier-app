/**
 * Settings › Nib: how present he is, what he may bring up unasked, his name and colours, and every
 * lesson he gives, each restartable. Each kind of unprompted message can be switched off on its
 * own.
 */

import { NibHead } from '@bezier/nib';
import { useState, useSyncExternalStore } from 'react';
import { OFFERS_RESET } from './island/first-offers.js';
import { nib, startGuide } from './nib.js';
import { LESSONS, type Lesson } from './nib-guides.js';
import { NIB_BODIES, NIB_EYES, type NibShows, type NibStyle } from './nib-style.js';
import { Group, Row, Segmented, Swatches, Switch } from './PrefsControls.js';
import type { AppPrefs } from './preferences.js';
import { closeSettings } from './settings-request.js';

type Setter = <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => void;

const SHOWS: readonly (readonly [keyof NibShows, string, string])[] = [
  [
    'work',
    'Work under way',
    'Opening a project, an import, an export or a long rebuild: up at the top with how far along, once it takes more than a moment.',
  ],
  [
    'strain',
    'When the machine struggles',
    'He sweats when the view slows down for a while, and offers a lighter display: fewer facets, panels without blur. The model itself is never changed.',
  ],
  [
    'firsts',
    'First-time help',
    'The lesson for a workspace, offered once, the first time you open it. "Later" keeps it in the list below.',
  ],
  ['notes', 'A word on your firsts', 'Your first part, your first drawing. Chatty only.'],
];

/** Starts a lesson from Settings: back to the work, then the lesson (first in a new project). */
function begin(lesson: Lesson): void {
  closeSettings();
  if (lesson.id === 'first-part' && document.querySelector('.library[data-loaded]') !== null)
    window.dispatchEvent(new CustomEvent('bezier:new-project'));
  startGuide(lesson.guide);
}

export function NibSettings({ prefs, set }: { prefs: AppPrefs; set: Setter }) {
  const style = prefs.nibStyle;
  const restyle = (next: Partial<NibStyle>) => set('nibStyle', { ...style, ...next });
  const done = useSyncExternalStore(nib.subscribe, () => nib.memory.guides);
  const [offersReset, setOffersReset] = useState(false);
  const off = prefs.nib === 'off';

  return (
    <>
      <Group label="Presence">
        <Row
          label={style.name}
          note="Quiet: only when needed, for work under way, lessons, the first time in a workspace, and when something went wrong. Chatty: also a word on your firsts and a sleepy face after a long break. Off: not loaded at all."
        >
          <Segmented
            name="nib"
            onChange={(value) => set('nib', value)}
            options={[
              ['off', 'Off'],
              ['quiet', 'Quiet'],
              ['friendly', 'Chatty'],
            ]}
            value={prefs.nib}
          />
        </Row>
      </Group>

      <Group label="What he brings up by himself">
        {SHOWS.map(([key, label, note]) => (
          <Row key={key} label={label} note={note}>
            <Switch
              checked={style.shows[key]}
              disabled={off || (key === 'notes' && prefs.nib !== 'friendly')}
              label={label}
              onChange={(value) => restyle({ shows: { ...style.shows, [key]: value } })}
            />
          </Row>
        ))}
      </Group>

      <Group label="Look">
        <div className="prefs-nib__look">
          <div className="prefs-nib__preview">
            {!off && (
              <NibHead
                active
                look={{ body: style.body, eyes: style.eyes }}
                model="/nib/nib.glb"
                mood="curious"
                onState={() => undefined}
                still={false}
              />
            )}
          </div>
          <div className="prefs-nib__fields">
            <Row label="Name" note="What he is called in the island and here.">
              <input
                aria-label="Name"
                className="prefs-nib__name"
                maxLength={24}
                onChange={(event) => restyle({ name: event.target.value })}
                onBlur={(event) => {
                  if (event.target.value.trim() === '') restyle({ name: 'Nib' });
                }}
                type="text"
                value={style.name}
              />
            </Row>
            <Row label="Eyes">
              <Swatches
                name="nib-eyes"
                onChange={(value) => restyle({ eyes: value })}
                options={NIB_EYES}
                value={style.eyes}
              />
            </Row>
            <Row label="Shell">
              <Swatches
                name="nib-body"
                onChange={(value) => restyle({ body: value })}
                options={NIB_BODIES}
                value={style.body}
              />
            </Row>
          </div>
        </div>
      </Group>

      <Group
        label="Lessons"
        note="A lesson can be folded away at any time (Esc, or the arrow at its top) and stays at the top of the window, a click away. It ends only with its ×."
      >
        {LESSONS.map((lesson) => (
          <Row
            key={lesson.id}
            label={lesson.title}
            note={`${String(lesson.guide.steps.length)} steps · about ${String(lesson.minutes)} min${done.includes(lesson.id) ? ' · done' : ''}`}
          >
            <button
              className="prefs-button"
              disabled={off}
              onClick={() => begin(lesson)}
              type="button"
            >
              {done.includes(lesson.id) ? 'Again' : 'Start'}
            </button>
          </Row>
        ))}
        <Row
          label="First-time help"
          note="Offer each workspace's lesson again the next time it is opened."
        >
          <button
            className="prefs-button"
            disabled={offersReset}
            onClick={() => {
              try {
                window.localStorage.removeItem('bezier.nib.offered');
              } catch {
                // Storage unavailable; nothing to keep.
              }
              window.dispatchEvent(new Event(OFFERS_RESET));
              setOffersReset(true);
            }}
            type="button"
          >
            {offersReset ? 'Done' : 'Reset'}
          </button>
        </Row>
      </Group>
    </>
  );
}
