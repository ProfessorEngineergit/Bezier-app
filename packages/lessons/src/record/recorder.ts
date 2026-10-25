/**
 * Records a lesson from the editor's viewport. The canvas is captured at 30 fps with the
 * microphone added; the author's camera uses a second recorder. Input becomes events and each
 * committed edit a checkpoint. Everything is written to the draft store as it happens (drafts.ts).
 */

import { type Observable, observable } from '../app/observable.js';
import type { LessonEvent, LessonLevel, LessonState, StoredLesson } from '../format/manifest.js';
import type { HostViewport, LessonHost } from '../host/contract.js';
import { captureInput } from './capture.js';
import { recordingClock } from './clock.js';
import { deviceProblem } from './devices.js';
import { appendChunk, type Draft, deleteDraft, manifestFromDraft, saveDraft } from './drafts.js';

export interface RecordingOptions {
  title: string;
  level: LessonLevel;
  microphone: boolean;
  camera: boolean;
}

export interface RecordingStatus {
  elapsed: number;
  paused: boolean;
  checkpoints: number;
  /** An error to show the author. */
  error: string | null;
}

export interface RecordingSession {
  id: string;
  options: RecordingOptions;
  /** Devices that could not be started, e.g. a refused camera, as user-facing text. */
  notes: { title: string; detail: string }[];
  status: Observable<RecordingStatus>;
  pause(): void;
  resume(): void;
  /** Adds the current model as a checkpoint; the author names it later. */
  addCheckpoint(): Promise<void>;
  /** Stops recording and returns the lesson; the caller stores it. */
  finish(): Promise<StoredLesson>;
  /** Stops recording and discards it. */
  cancel(): Promise<void>;
}

/** MP4 where supported (WebKit), otherwise WebM. */
export function preferredMimeType(withAudio: boolean): string | undefined {
  const candidates = withAudio
    ? [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
      ]
    : ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Media chunk interval; also the most media a reload can lose. */
const CHUNK_MS = 1000;
/** Minimum interval between saves of events and checkpoints. */
const SAVE_MS = 2000;

const stopped = (recorder: MediaRecorder) =>
  new Promise<void>((resolve) => {
    if (recorder.state === 'inactive') return resolve();
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.stop();
  });

/** Whether the recording APIs exist. They may still not work; see `recordingWorks`. */
export function canRecordViewport(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/**
 * Whether canvas recording actually produces video, tested by briefly recording a small animated
 * canvas. Feature detection is not enough: WebKitGTK (the Linux app) reports MediaRecorder and
 * H.264 support but returns an empty file when no encoder is installed.
 */
export async function recordingWorks(): Promise<boolean> {
  if (!canRecordViewport()) return false;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (context === null) return false;
  const stream = canvas.captureStream(30);
  try {
    const type = preferredMimeType(false);
    const recorder = new MediaRecorder(stream, type === undefined ? {} : { mimeType: type });
    let bytes = 0;
    recorder.addEventListener('dataavailable', (event) => {
      bytes += event.data.size;
    });
    recorder.start(100);
    for (let frame = 0; frame < 10; frame++) {
      context.fillStyle = frame % 2 === 0 ? '#c00' : '#00c';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    await Promise.race([stopped(recorder), new Promise((resolve) => setTimeout(resolve, 2000))]);
    return bytes > 0;
  } catch {
    return false;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export async function startRecording(
  host: LessonHost,
  viewport: HostViewport,
  options: RecordingOptions,
): Promise<RecordingSession> {
  if (!canRecordViewport()) {
    throw new Error('This browser cannot record the viewport; use the Mac app or Chrome.');
  }
  const first = await host.snapshot();
  if (first === null) throw new Error('Open a project in the editor first, then record.');

  const streams: MediaStream[] = [];
  const stream = viewport.canvas.captureStream(30);
  streams.push(stream);
  try {
    // Start each device separately, so a refused or missing camera does not stop the recording.
    const notes: { title: string; detail: string }[] = [];
    const device = async (kind: 'microphone' | 'camera', constraints: MediaStreamConstraints) => {
      try {
        const found = await navigator.mediaDevices.getUserMedia(constraints);
        streams.push(found);
        return found;
      } catch (problem) {
        notes.push({
          title: `Recording without the ${kind}`,
          detail: deviceProblem(kind, problem),
        });
        return null;
      }
    };
    const microphone = options.microphone ? await device('microphone', { audio: true }) : null;
    if (microphone !== null) {
      for (const track of microphone.getAudioTracks()) stream.addTrack(track);
    }
    const cameraStream = options.camera
      ? await device('camera', { video: true, audio: false })
      : null;

    const recorderOptions = (type: string | undefined): MediaRecorderOptions =>
      type === undefined ? {} : { mimeType: type };
    const viewportRecorder = new MediaRecorder(
      stream,
      recorderOptions(preferredMimeType(microphone !== null)),
    );
    const cameraRecorder =
      cameraStream === null
        ? null
        : new MediaRecorder(cameraStream, recorderOptions(preferredMimeType(false)));

    const session = assemble(
      host,
      viewport,
      options,
      streams,
      viewportRecorder,
      cameraRecorder,
      first,
    );
    session.notes = notes;
    return session;
  } catch (problem) {
    for (const item of streams) for (const track of item.getTracks()) track.stop();
    throw problem;
  }
}

function assemble(
  host: LessonHost,
  viewport: HostViewport,
  options: RecordingOptions,
  streams: MediaStream[],
  viewportRecorder: MediaRecorder,
  cameraRecorder: MediaRecorder | null,
  firstProject: string,
): RecordingSession {
  const id = crypto.randomUUID();
  const clock = recordingClock();
  const events: LessonEvent[] = [];
  const states: LessonState[] = [{ time: 0, title: 'Start', project: firstProject }];
  const chunks: Record<'viewport' | 'camera', Blob[]> = { viewport: [], camera: [] };
  const status = observable<RecordingStatus>({
    elapsed: 0,
    paused: false,
    checkpoints: 1,
    error: null,
  });

  const draft = (): Draft => ({
    id,
    title: options.title,
    level: options.level,
    startedAt: new Date().toISOString(),
    elapsed: clock.elapsed(),
    events,
    states,
    viewportType: viewportRecorder.mimeType,
    ...(cameraRecorder === null ? {} : { cameraType: cameraRecorder.mimeType }),
  });
  const startedAt = draft().startedAt;

  // Serialize disk writes so chunks and saves land in order.
  let disk: Promise<unknown> = saveDraft({ ...draft(), startedAt });
  const onDisk = (work: () => Promise<unknown>) => {
    disk = disk.catch(() => undefined).then(work);
    disk.catch((problem: unknown) => {
      console.error(problem);
      status.update((s) => ({
        ...s,
        error: 'The recording is not being saved as it goes; finish soon to keep it.',
      }));
    });
  };
  let saveTimer = 0;
  const scheduleSave = () => {
    if (saveTimer !== 0) return;
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      onDisk(() => saveDraft({ ...draft(), startedAt }));
    }, SAVE_MS);
  };

  const sequence = { viewport: 0, camera: 0 };
  const collect = (recorder: MediaRecorder, kind: 'viewport' | 'camera') => {
    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      chunks[kind].push(event.data);
      const seq = sequence[kind]++;
      onDisk(() => appendChunk(id, kind, seq, event.data));
      scheduleSave();
    };
  };
  collect(viewportRecorder, 'viewport');
  if (cameraRecorder !== null) collect(cameraRecorder, 'camera');

  const checkpoint = (title: string, project: string) => {
    const time = clock.elapsed();
    states.push({ time, title, project });
    status.update((s) => ({ ...s, checkpoints: states.length }));
    scheduleSave();
  };
  const stopEdits = host.onEdit((edit) => {
    if (clock.paused()) return;
    events.push({
      kind: 'edit',
      time: clock.elapsed(),
      title: edit.title,
      operation: edit.operation,
    });
    checkpoint(edit.title, edit.project);
  });
  const stopInput = captureInput(viewport, clock, (event) => {
    events.push(event);
  });
  const ticker = window.setInterval(
    () => status.update((s) => ({ ...s, elapsed: clock.elapsed() })),
    250,
  );

  viewportRecorder.start(CHUNK_MS);
  cameraRecorder?.start(CHUNK_MS);

  let ended = false;
  const end = async () => {
    if (ended) return;
    ended = true;
    clock.pause();
    stopEdits();
    stopInput();
    window.clearInterval(ticker);
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    await Promise.all([
      stopped(viewportRecorder),
      cameraRecorder === null ? null : stopped(cameraRecorder),
    ]);
    for (const item of streams) for (const track of item.getTracks()) track.stop();
  };

  return {
    id,
    options,
    notes: [],
    status,
    pause() {
      if (ended || clock.paused()) return;
      clock.pause();
      if (viewportRecorder.state === 'recording') viewportRecorder.pause();
      if (cameraRecorder?.state === 'recording') cameraRecorder.pause();
      status.update((s) => ({ ...s, paused: true, elapsed: clock.elapsed() }));
      scheduleSave();
    },
    resume() {
      if (ended || !clock.paused()) return;
      if (viewportRecorder.state === 'paused') viewportRecorder.resume();
      if (cameraRecorder?.state === 'paused') cameraRecorder.resume();
      clock.resume();
      status.update((s) => ({ ...s, paused: false }));
    },
    async addCheckpoint() {
      const project = await host.snapshot();
      if (project === null) throw new Error('There is no model open to keep as a checkpoint.');
      checkpoint(`Checkpoint ${states.length}`, project);
    },
    async finish() {
      await end();
      // The final chunks arrived with the stop events.
      await disk.catch(() => undefined);
      const duration = clock.elapsed();
      const viewport = new Blob(chunks.viewport, { type: viewportRecorder.mimeType });
      const camera =
        cameraRecorder === null
          ? undefined
          : new Blob(chunks.camera, { type: cameraRecorder.mimeType });
      return {
        manifest: manifestFromDraft({ ...draft(), startedAt }, duration),
        viewport,
        ...(camera === undefined ? {} : { camera }),
      };
    },
    async cancel() {
      await end();
      await disk.catch(() => undefined);
      await deleteDraft(id);
    },
  };
}
