/**
 * The inspector for the timeline selection and its actions. With nothing selected it shows the
 * In and Out points.
 */

import { type Clip, clipAt, deleteClip, fillGap, splitClip } from '../format/clips.js';
import { clock, clockFine } from '../format/clock.js';
import { canRemoveChapter, removeChapter, renameChapter } from '../format/edits.js';
import type { LessonManifest } from '../format/manifest.js';
import type { Chapter } from '../format/timeline.js';
import { addZoom, removeZoom, setZoomScale, ZOOM_SCALES } from '../format/zoom.js';
import { Icon } from '../ui/Icon.js';
import type { Selection, TrimPoints } from './selection.js';

interface Props {
  manifest: LessonManifest;
  clips: readonly Clip[];
  chapters: readonly Chapter[];
  selection: Selection;
  points: TrimPoints;
  time: number;
  onSelect: (selection: Selection) => void;
  onPoints: (points: TrimPoints) => void;
  onSeek: (time: number) => void;
  onChange: (edit: (manifest: LessonManifest) => LessonManifest, group?: string) => void;
  onRemoveBetween: () => void;
}

const Key = ({ children }: { children: string }) => (
  <kbd className="lessons-edit__key">{children}</kbd>
);

export function Inspector(props: Props) {
  const { manifest, clips, selection, points, time, onSelect, onChange, onSeek } = props;
  const small = 'lessons-button lessons-button--small';
  let title = 'Timeline';
  let body: React.ReactNode;

  if (selection?.kind === 'clip') {
    const clip = clips[selection.index];
    const under = clipAt(clips, time)?.index === selection.index;
    title = `Clip ${selection.index + 1}`;
    body = clip !== undefined && (
      <>
        <p className="lessons-dim lessons-edit__range">
          {clockFine(clip.start)} – {clockFine(clip.end)} · {(clip.end - clip.start).toFixed(1)} s
        </p>
        <div className="lessons-edit__trim">
          <button
            className={small}
            disabled={!under}
            onClick={() => onChange((m) => splitClip(m, time))}
            title={under ? undefined : 'Move the playhead into this clip first'}
            type="button"
          >
            <Icon name="split" /> Split at playhead <Key>C</Key>
          </button>
          <button
            className={small}
            onClick={() => {
              onChange((m) => addZoom(m, { start: clip.start, end: clip.end, scale: 1.5 }));
              onSelect(null);
            }}
            type="button"
          >
            <Icon name="zoom-in" /> Zoom in on this clip
          </button>
          <button
            className={`${small} lessons-button--danger`}
            disabled={clips.length < 2}
            onClick={() => {
              onChange((m) => deleteClip(m, selection.index));
              onSelect(null);
            }}
            title={clips.length < 2 ? 'The lesson has to play something' : undefined}
            type="button"
          >
            <Icon name="trash" /> Delete clip <Key>⌫</Key>
          </button>
        </div>
      </>
    );
  } else if (selection?.kind === 'gap') {
    const { stretch } = selection;
    title = 'Left out';
    body = (
      <>
        <p className="lessons-dim lessons-edit__range">
          {clockFine(stretch.start)} – {clockFine(stretch.end)} · playback skips it
        </p>
        <div className="lessons-edit__trim">
          <button
            className={small}
            onClick={() => {
              onChange((m) => fillGap(m, stretch));
              onSelect(null);
            }}
            type="button"
          >
            <Icon name="restore" /> Restore
          </button>
        </div>
      </>
    );
  } else if (selection?.kind === 'chapter') {
    const chapter = props.chapters[selection.index];
    title = `Chapter ${selection.index + 1}`;
    body = chapter !== undefined && (
      <>
        <input
          aria-label={`Name of chapter ${chapter.index + 1}`}
          className="lessons-input"
          onChange={(event) =>
            onChange(
              (m) => renameChapter(m, chapter.index, event.target.value),
              `name:${chapter.index}`,
            )
          }
          value={chapter.title}
        />
        <div className="lessons-edit__trim">
          <button className={small} onClick={() => onSeek(chapter.time)} type="button">
            <Icon name="flag" /> At {clockFine(chapter.time)}
          </button>
          <button
            className={`${small} lessons-button--danger`}
            disabled={!canRemoveChapter(manifest, chapter.index)}
            onClick={() => {
              onChange((m) => removeChapter(m, chapter.index));
              onSelect(null);
            }}
            title={
              chapter.index === 0
                ? 'The first chapter is the model the lesson starts from'
                : undefined
            }
            type="button"
          >
            <Icon name="trash" /> Remove <Key>⌫</Key>
          </button>
        </div>
        {chapter.index > 0 && (
          <span className="lessons-faint lessons-edit__hint">
            Drag the flag on the timeline to move the chapter.
          </span>
        )}
      </>
    );
  } else if (selection?.kind === 'zoom') {
    const zoom = manifest.zooms?.[selection.index];
    title = 'Zoom';
    body = zoom !== undefined && (
      <>
        <p className="lessons-dim lessons-edit__range">
          {clockFine(zoom.start)} – {clockFine(zoom.end)} · the view follows the pointer
        </p>
        <div className="lessons-edit__trim">
          <fieldset aria-label="Zoom scale" className="lessons-segmented">
            {ZOOM_SCALES.map((scale) => (
              <button
                aria-pressed={scale === zoom.scale}
                key={scale}
                onClick={() => onChange((m) => setZoomScale(m, selection.index, scale))}
                type="button"
              >
                {scale}×
              </button>
            ))}
          </fieldset>
          <button
            className={`${small} lessons-button--danger`}
            onClick={() => {
              onChange((m) => removeZoom(m, selection.index));
              onSelect(null);
            }}
            type="button"
          >
            <Icon name="trash" /> Remove <Key>⌫</Key>
          </button>
        </div>
      </>
    );
  } else {
    const ready = points.in !== null && points.out !== null && points.out - points.in > 0.05;
    const between =
      ready && points.in !== null && points.out !== null
        ? `${clock(points.in)}–${clock(points.out)}`
        : null;
    body = (
      <>
        <div className="lessons-edit__trim">
          <button
            aria-label={`Set In at ${clockFine(time)}`}
            className={small}
            onClick={() =>
              props.onPoints({
                in: time,
                out: points.out !== null && points.out > time ? points.out : null,
              })
            }
            type="button"
          >
            In {points.in === null ? '' : clockFine(points.in)} <Key>I</Key>
          </button>
          <button
            aria-label={`Set Out at ${clockFine(time)}`}
            className={small}
            onClick={() =>
              props.onPoints({
                in: points.in !== null && points.in < time ? points.in : null,
                out: time,
              })
            }
            type="button"
          >
            Out {points.out === null ? '' : clockFine(points.out)} <Key>O</Key>
          </button>
          <button
            className={`${small} lessons-button--primary`}
            disabled={!ready}
            onClick={props.onRemoveBetween}
            type="button"
          >
            <Icon name="scissors" /> {between === null ? 'Cut between' : `Cut ${between}`}
          </button>
          <button
            className={small}
            disabled={!ready}
            onClick={() => {
              if (points.in === null || points.out === null) return;
              onChange((m) =>
                addZoom(m, { start: points.in ?? 0, end: points.out ?? 0, scale: 1.5 }),
              );
              props.onPoints({ in: null, out: null });
            }}
            type="button"
          >
            <Icon name="zoom-in" /> Zoom in between <Key>Z</Key>
          </button>
        </div>
        <span className="lessons-faint lessons-edit__hint">
          Pick a clip, a flag or a zoom on the timeline. <Key>C</Key> splits the clip at the
          playhead, <Key>M</Key> adds a chapter there. A cut hides a stretch from the learner; the
          recording keeps it, and Restore brings it back.
        </span>
      </>
    );
  }

  return (
    <section aria-label={title} className="lessons-edit__section">
      <div className="lessons-edit__section-head">
        <p className="lessons-label">{title}</p>
        {selection !== null && (
          <button
            aria-label="Deselect"
            className="lessons-button lessons-button--quiet lessons-button--icon lessons-button--small"
            onClick={() => onSelect(null)}
            type="button"
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      {body}
    </section>
  );
}
