/**
 * The only interface between the Lessons app and the Bezier editor. Lessons never imports the
 * editor; recording, following and opening checkpoints all go through `LessonHost`. The editor's
 * implementation is `apps/studio/src/lessons-host.ts`.
 *
 * Add members; do not change the meaning of existing ones.
 */

/** A change the author made to the model, as the editor's history names it. */
export interface HostEdit {
  /** The editor's history label, e.g. "Extrude" or "Rename body". */
  title: string;
  /** The editor's record of the change. Stored with the lesson, never read here. */
  operation: unknown;
  /** The whole model after the change, as Bezier project text. */
  project: string;
}

/** The editor's drawing surface, while a project is open in it. */
export interface HostViewport {
  /** The WebGL canvas, recorded with `captureStream`. */
  canvas: HTMLCanvasElement;
  /**
   * The element the author works in. While recording, clicks and keys are read from it (keys also
   * from `window`) to show them to learners.
   */
  element: HTMLElement;
}

export type ColorScheme = 'light' | 'dark';

export interface LessonHost {
  // The model.

  /** The open model as Bezier project text; null when no project is open. */
  snapshot(): Promise<string | null>;

  /**
   * Called after every change the author commits (not on previews while a handle is dragged).
   * Returns the way to stop listening.
   */
  onEdit(listener: (edit: HostEdit) => void): () => void;

  /**
   * Shows a checkpoint in the editor for following along. It becomes a saved project only once the
   * learner changes something; showing another state replaces it. `title` is the lesson title and
   * the name of that project.
   */
  showState(project: string, title: string, lesson?: { lesson: string; at: number }): Promise<void>;

  /** Starts an empty project to record into. */
  newProject(name: string): Promise<void>;

  // Where the user is.

  /** The editor's canvas and working area, or null when no project is open. */
  viewport(): HostViewport | null;

  /** Brings the editor to the front (to record or to follow along). */
  showEditor(): void;

  /** Brings the Lessons home to the front. */
  showLessons(): void;

  // How it should look.

  colorScheme(): ColorScheme;
  onColorScheme(listener: (scheme: ColorScheme) => void): () => void;
  /** True when the user asked for reduced motion, in the editor's or the system's settings. */
  reducedMotion(): boolean;
}
