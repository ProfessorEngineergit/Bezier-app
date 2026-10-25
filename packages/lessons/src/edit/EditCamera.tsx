import { CORNERS } from '../format/camera.js';
import { clock } from '../format/clock.js';
import { removeCameraCue, setCameraCorner } from '../format/edits.js';
import type { AvatarCorner, LessonManifest } from '../format/manifest.js';
import { Icon } from '../ui/Icon.js';

interface Props {
  manifest: LessonManifest;
  time: number;
  onSeek: (time: number) => void;
  onChange: (edit: (manifest: LessonManifest) => LessonManifest, group?: string) => void;
}

const WORDS: Record<AvatarCorner, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};

/** Sets the camera picture's corner from the playhead on. The picture still dodges clicks. */
export function EditCamera({ manifest, time, onSeek, onChange }: Props) {
  return (
    <section aria-label="Your camera" className="lessons-edit__section">
      <div className="lessons-edit__section-head">
        <p className="lessons-label">Your camera, from {clock(time)} on</p>
      </div>
      <fieldset aria-label="Corner" className="lessons-segmented">
        {CORNERS.map((corner) => (
          <button
            key={corner}
            onClick={() => onChange((m) => setCameraCorner(m, time, corner))}
            type="button"
          >
            {WORDS[corner]}
          </button>
        ))}
      </fieldset>
      <ul className="lessons-edit__removed">
        {manifest.avatar.map((cue, index) => (
          <li key={`${cue.time}-${cue.corner}`}>
            <button
              className="lessons-edit__chapter-time"
              onClick={() => onSeek(cue.time)}
              type="button"
            >
              {clock(cue.time)}
            </button>
            <span>{WORDS[cue.corner]}</span>
            {manifest.avatar.length > 1 && (
              <button
                aria-label={`Remove the move at ${clock(cue.time)}`}
                className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
                onClick={() => onChange((m) => removeCameraCue(m, index))}
                type="button"
              >
                <Icon name="close" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
