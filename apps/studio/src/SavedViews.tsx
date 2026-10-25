/**
 * Named camera views saved with the document: save the current camera, click to return, cross to
 * remove. Each is a history step, so it undoes like any edit and travels with the file.
 */

import type { SavedView } from '@bezier/core';
import { type MutableRefObject, useState } from 'react';
import type { Session, SessionView } from './session.js';
import type { ViewportHandle } from './Viewport.js';
import './menu.css';

export type Run = (change: (session: Session) => Promise<SessionView>) => void;

interface Props {
  views: readonly SavedView[];
  run: Run;
  viewportRef: MutableRefObject<ViewportHandle | null>;
  /** Called when a view was chosen and the panel is done. */
  onChosen: () => void;
}

/** The next free "View n". */
function nextName(views: readonly SavedView[]): string {
  for (let n = views.length + 1; ; n += 1) {
    const name = `View ${n}`;
    if (!views.some((view) => view.name === name)) return name;
  }
}

export function SavedViews({ views, run, viewportRef, onChosen }: Props) {
  const [name, setName] = useState('');
  const save = () => {
    const camera = viewportRef.current?.cameraView();
    if (camera === undefined) return;
    const chosen = name.trim() === '' ? nextName(views) : name.trim();
    setName('');
    void run((session) =>
      session.apply({ op: 'setSavedView', name: chosen, view: { ...camera, name: chosen } }),
    );
  };
  return (
    <section aria-label="Saved views" className="saved-views">
      {views.map((view) => (
        <span className="saved-views__item" key={view.name}>
          <button
            onClick={() => {
              viewportRef.current?.showCameraView(view);
              onChosen();
            }}
            type="button"
          >
            {view.name}
          </button>
          <button
            aria-label={`Remove view ${view.name}`}
            className="saved-views__remove"
            onClick={() =>
              void run((session) =>
                session.apply({ op: 'setSavedView', name: view.name, view: null }),
              )
            }
            type="button"
          >
            ×
          </button>
        </span>
      ))}
      <form
        className="saved-views__save"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <input
          aria-label="Name of the view to save"
          onChange={(event) => setName(event.target.value)}
          placeholder={nextName(views)}
          value={name}
        />
        <button type="submit">Save view</button>
      </form>
    </section>
  );
}
