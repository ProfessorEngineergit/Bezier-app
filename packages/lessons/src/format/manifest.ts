/**
 * Version 1 of the `bezier-lesson` format, as stored and shared.
 *
 * Exported `.bezierlesson` packages exist in this shape and must keep loading. Add optional fields
 * or a version 2 with a version 1 reader; never change what a field means. See
 * docs/lesson-format.md.
 */

/** What the author did, in lesson time (seconds from the start of the video). */
export type LessonEvent =
  | { kind: 'key'; time: number; code: string; key: string; modifiers: string[] }
  /** x and y are 0 to 1 across the recorded viewport, from its top left. */
  | { kind: 'click'; time: number; x: number; y: number; button: number }
  | { kind: 'pointer'; time: number; x: number; y: number }
  /** A model change, titled as in the editor's history ("Extrude"). */
  | { kind: 'edit'; time: number; title: string; operation: unknown };

/** A checkpoint: the model at a moment of the lesson, which the learner can open. */
export interface LessonState {
  time: number;
  title: string;
  /** The whole model as Bezier project text (reference/current/core/project-file.ts). */
  project: string;
}

export type AvatarCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** The corner of the author's camera picture from `time` on. */
export interface AvatarCue {
  time: number;
  corner: AvatarCorner;
}

/** Between `start` and `end` the picture is zoomed `scale` times around the pointer. */
export interface ZoomCue {
  start: number;
  end: number;
  scale: number;
}

export type LessonLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LessonManifest {
  format: 'bezier-lesson';
  version: 1;
  id: string;
  title: string;
  description: string;
  level?: LessonLevel;
  /** ISO 8601. */
  createdAt: string;
  /** Seconds. */
  duration: number;
  /** MIME type of the viewport video: `video/mp4…` or `video/webm…`. */
  viewportType: string;
  /** MIME type of the author's camera video, when there is one. */
  cameraType?: string;
  events: LessonEvent[];
  /** At least one; ordered by time. */
  states: LessonState[];
  /**
   * The stretches of the video that play, in seconds, in order. New recordings start with one cut
   * covering everything; an empty list also plays everything.
   */
  cuts: { start: number; end: number }[];
  avatar: AvatarCue[];
  /** Whether the learner has finished it. Reset when a package is imported. */
  completed: boolean;
  /**
   * Stretches the player zooms in on the pointer. Optional because it was added within version 1;
   * readers that ignore it play the lesson unzoomed.
   */
  zooms?: ZoomCue[];
}

/** A lesson with its media. */
export interface StoredLesson {
  manifest: LessonManifest;
  viewport: Blob;
  camera?: Blob;
}

const LEVELS: readonly string[] = ['beginner', 'intermediate', 'advanced'];
const CORNERS: readonly string[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

const finiteTime = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const unit = (value: unknown): boolean => typeof value === 'number' && value >= 0 && value <= 1;

function isEvent(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const event = value as Partial<Record<string, unknown>>;
  if (!finiteTime(event.time)) return false;
  switch (event.kind) {
    case 'edit':
      return typeof event.title === 'string';
    case 'key':
      return (
        typeof event.code === 'string' &&
        typeof event.key === 'string' &&
        Array.isArray(event.modifiers)
      );
    case 'click':
    case 'pointer':
      return unit(event.x) && unit(event.y);
    default:
      return false;
  }
}

/** Whether `value` is a playable manifest. Fully validated, since packages are untrusted. */
export function isManifest(value: unknown): value is LessonManifest {
  if (value === null || typeof value !== 'object') return false;
  const m = value as Partial<LessonManifest>;
  const duration = typeof m.duration === 'number' ? m.duration : -1;
  return (
    m.format === 'bezier-lesson' &&
    m.version === 1 &&
    typeof m.id === 'string' &&
    typeof m.title === 'string' &&
    typeof m.description === 'string' &&
    typeof m.createdAt === 'string' &&
    typeof m.viewportType === 'string' &&
    (m.level === undefined || LEVELS.includes(m.level)) &&
    Number.isFinite(duration) &&
    duration >= 0 &&
    Array.isArray(m.events) &&
    m.events.length <= 1_000_000 &&
    m.events.every(isEvent) &&
    Array.isArray(m.states) &&
    m.states.length > 0 &&
    m.states.length <= 50_000 &&
    m.states.every(
      (state) =>
        typeof state.project === 'string' &&
        typeof state.title === 'string' &&
        finiteTime(state.time),
    ) &&
    Array.isArray(m.cuts) &&
    m.cuts.every(
      (cut) =>
        finiteTime(cut.start) &&
        typeof cut.end === 'number' &&
        cut.end <= duration &&
        cut.start <= cut.end,
    ) &&
    Array.isArray(m.avatar) &&
    m.avatar.every((cue) => finiteTime(cue.time) && CORNERS.includes(cue.corner)) &&
    (m.zooms === undefined ||
      (Array.isArray(m.zooms) &&
        m.zooms.every(
          (zoom) =>
            finiteTime(zoom.start) &&
            finiteTime(zoom.end) &&
            zoom.start <= zoom.end &&
            typeof zoom.scale === 'number' &&
            zoom.scale >= 1 &&
            zoom.scale <= 4,
        )))
  );
}
