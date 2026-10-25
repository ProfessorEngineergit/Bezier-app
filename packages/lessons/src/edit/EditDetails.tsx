import { useId } from 'react';
import { setDetails } from '../format/edits.js';
import type { LessonLevel, LessonManifest } from '../format/manifest.js';
import { LEVELS, levelWord } from '../format/summary.js';

interface Props {
  manifest: LessonManifest;
  onChange: (edit: (manifest: LessonManifest) => LessonManifest, group?: string) => void;
}

export function EditDetails({ manifest, onChange }: Props) {
  const id = useId();
  return (
    <section aria-label="About this lesson" className="lessons-edit__section">
      <label className="lessons-field" htmlFor={`${id}-title`}>
        Title
        <input
          className="lessons-input lessons-edit__title"
          id={`${id}-title`}
          onChange={(event) =>
            onChange((m) => setDetails(m, { title: event.target.value }), 'title')
          }
          placeholder="Untitled lesson"
          value={manifest.title}
        />
      </label>
      <label className="lessons-field" htmlFor={`${id}-description`}>
        Description
        <textarea
          className="lessons-input"
          id={`${id}-description`}
          onChange={(event) =>
            onChange((m) => setDetails(m, { description: event.target.value }), 'description')
          }
          placeholder="What will they make, and what should they know first?"
          value={manifest.description}
        />
      </label>
      <div className="lessons-field">
        Level
        <fieldset aria-label="Level" className="lessons-segmented">
          {LEVELS.map((level: LessonLevel) => (
            <button
              aria-pressed={manifest.level === level}
              key={level}
              onClick={() => onChange((m) => setDetails(m, { level }))}
              type="button"
            >
              {levelWord(level)}
            </button>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
