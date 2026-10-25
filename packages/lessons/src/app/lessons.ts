/**
 * The Lessons app object. The editor creates it once from its host and passes it to both mount
 * points. It owns the state in `state.ts` and every action that changes it.
 */

import type { LessonManifest, StoredLesson } from '../format/manifest.js';
import { readPackage, writePackage } from '../format/package.js';
import type { LessonHost } from '../host/contract.js';
import { type Draft, deleteDraft, draftToLesson } from '../record/drafts.js';
import { type RecordingOptions, startRecording } from '../record/recorder.js';
import { getLesson, putLesson, putManifest, removeLesson } from '../store/lessons.js';
import { forgetLesson, rememberSummary } from '../store/library.js';
import { download, packageFilename } from '../ui/download.js';
import { type Observable, observable } from './observable.js';
import { initialState, type LessonsState, type Notice, type Screen } from './state.js';

export interface Lessons {
  host: LessonHost;
  state: Observable<LessonsState>;
  show(screen: Screen): void;
  notify(text: string, options?: NoticeOptions): void;
  /** Shows the message of a thrown error as a sticky notice. */
  complain(problem: unknown, fallback: string, over?: Notice['over']): void;
  dismissNotice(): void;
  /** Loads a lesson from the store, caching the most recent one. */
  load(id: string): Promise<StoredLesson>;
  importPackage(file: Blob, name?: string): Promise<StoredLesson>;
  saveManifest(manifest: LessonManifest): Promise<void>;
  exportLesson(id: string): Promise<void>;
  deleteLesson(id: string): Promise<void>;
  follow(id: string, at: number): Promise<void>;
  leaveFollow(): void;
  record(options: RecordingOptions & { startEmpty: boolean }): Promise<void>;
  finishRecording(): Promise<void>;
  cancelRecording(): Promise<void>;
  keepDraft(draft: Draft): Promise<void>;
  discardDraft(draft: Draft): Promise<void>;
}

export interface NoticeOptions {
  detail?: string;
  tone?: Notice['tone'];
  sticky?: boolean;
  over?: Notice['over'];
}

const message = (problem: unknown, fallback: string) =>
  problem instanceof Error && problem.message !== '' ? problem.message : fallback;

/** Waits up to two seconds for the editor's canvas after opening a project. */
async function waitForViewport(host: LessonHost) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const viewport = host.viewport();
    if (viewport !== null) return viewport;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Open a project in the editor first, then record.');
}

export function createLessons(host: LessonHost): Lessons {
  const state = observable<LessonsState>(initialState);
  let cached: StoredLesson | null = null;
  let noticeKey = 0;
  let noticeTimer = 0;

  const bump = () => state.update((s) => ({ ...s, libraryVersion: s.libraryVersion + 1 }));
  const uncache = (id: string) => {
    if (cached?.manifest.id === id) cached = null;
  };

  const lessons: Lessons = {
    host,
    state,
    show: (screen) => state.update((s) => ({ ...s, screen })),

    notify(text, options = {}) {
      window.clearTimeout(noticeTimer);
      noticeKey += 1;
      const notice: Notice = {
        key: noticeKey,
        text,
        tone: options.tone ?? 'info',
        sticky: options.sticky ?? false,
        over: options.over ?? 'home',
        ...(options.detail === undefined ? {} : { detail: options.detail }),
      };
      state.update((s) => ({ ...s, notice }));
      if (!notice.sticky) noticeTimer = window.setTimeout(() => lessons.dismissNotice(), 4500);
    },
    complain(problem, fallback, over = 'home') {
      console.error(problem);
      lessons.notify(message(problem, fallback), { tone: 'fail', sticky: true, over });
    },
    dismissNotice: () => state.update((s) => (s.notice === null ? s : { ...s, notice: null })),

    async load(id) {
      if (cached?.manifest.id === id) return cached;
      const lesson = await getLesson(id);
      if (lesson === null) throw new Error('This lesson is no longer on this device.');
      cached = lesson;
      return lesson;
    },

    async importPackage(file) {
      let lesson: StoredLesson;
      try {
        lesson = await readPackage(new Uint8Array(await file.arrayBuffer()));
      } catch (problem) {
        console.error(problem);
        throw new Error(
          problem instanceof Error && /lesson|package|MB/i.test(problem.message)
            ? problem.message
            : 'This file could not be read as a lesson; it may not be a .bezierlesson package.',
        );
      }
      await putLesson(lesson);
      await rememberSummary(lesson.manifest, lesson.viewport.size + (lesson.camera?.size ?? 0));
      cached = lesson;
      bump();
      return lesson;
    },

    async saveManifest(manifest) {
      // Update the cache first so an immediate export includes the change. Writes are queued per
      // lesson.
      if (cached?.manifest.id === manifest.id) cached = { ...cached, manifest };
      await putManifest(manifest);
      await rememberSummary(manifest);
      bump();
    },

    async exportLesson(id) {
      const lesson = await lessons.load(id);
      const bytes = await writePackage(lesson);
      download(
        new Blob([bytes as BlobPart], { type: 'application/zip' }),
        packageFilename(lesson.manifest.title),
      );
    },

    async deleteLesson(id) {
      await removeLesson(id);
      await forgetLesson(id);
      uncache(id);
      state.update((s) => ({
        ...s,
        following: s.following?.lesson.manifest.id === id ? null : s.following,
        screen: 'id' in s.screen && s.screen.id === id ? { kind: 'list' } : s.screen,
      }));
      bump();
    },

    async follow(id, at) {
      const lesson = await lessons.load(id);
      const first = lesson.manifest.states[0];
      if (first === undefined) throw new Error('This lesson has no model to follow.');
      state.update((s) => ({ ...s, following: { lesson, at } }));
      host.showEditor();
    },
    leaveFollow: () => {
      state.update((s) => ({ ...s, following: null, screen: { kind: 'list' } }));
      host.showLessons();
    },

    async record(options) {
      if (state.get().recording !== null) throw new Error('A recording is already under way.');
      state.update((s) => ({ ...s, starting: true, following: null }));
      try {
        if (options.startEmpty) await host.newProject(options.title.trim() || 'Untitled lesson');
        host.showEditor();
        const viewport = await waitForViewport(host);
        const session = await startRecording(host, viewport, options);
        state.update((s) => ({ ...s, recording: session, starting: false }));
        // Report devices that failed to start once recording is under way, so the notice shows over
        // the editor instead of behind the closed sheet.
        for (const note of session.notes) {
          lessons.notify(note.title, {
            detail: note.detail,
            tone: 'fail',
            sticky: true,
            over: 'editor',
          });
        }
      } catch (problem) {
        state.update((s) => ({ ...s, starting: false }));
        throw problem;
      }
    },

    async finishRecording() {
      const session = state.get().recording;
      if (session === null) return;
      const lesson = await session.finish();
      await putLesson(lesson);
      await rememberSummary(lesson.manifest, lesson.viewport.size + (lesson.camera?.size ?? 0));
      await deleteDraft(session.id);
      cached = lesson;
      state.update((s) => ({
        ...s,
        recording: null,
        screen: { kind: 'edit', id: lesson.manifest.id },
      }));
      bump();
      host.showLessons();
    },

    async cancelRecording() {
      const session = state.get().recording;
      if (session === null) return;
      state.update((s) => ({ ...s, recording: null }));
      await session.cancel();
    },

    async keepDraft(draft) {
      const lesson = await draftToLesson(draft);
      await putLesson(lesson);
      await rememberSummary(lesson.manifest, lesson.viewport.size + (lesson.camera?.size ?? 0));
      await deleteDraft(draft.id);
      cached = lesson;
      bump();
      lessons.show({ kind: 'edit', id: lesson.manifest.id });
    },
    async discardDraft(draft) {
      await deleteDraft(draft.id);
      bump();
    },
  };
  return lessons;
}
