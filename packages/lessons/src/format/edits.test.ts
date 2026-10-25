import { describe, expect, it } from 'vitest';
import {
  addChapterAt,
  canRemoveChapter,
  moveChapter,
  removeCameraCue,
  removeChapter,
  removeStretch,
  renameChapter,
  restoreStretch,
  setCameraCorner,
  setCompleted,
  setDetails,
} from './edits.js';
import type { LessonManifest } from './manifest.js';
import { keptStretches } from './timeline.js';

const lesson: LessonManifest = {
  format: 'bezier-lesson',
  version: 1,
  id: 'one',
  title: 'Box',
  description: '',
  level: 'beginner',
  createdAt: '2026-09-28T20:05:25.808Z',
  duration: 100,
  viewportType: 'video/webm',
  events: [],
  states: [
    { time: 0, title: 'Start', project: 'a' },
    { time: 20, title: 'Sketch', project: 'b' },
    { time: 60, title: 'Extrude', project: 'c' },
  ],
  cuts: [{ start: 0, end: 100 }],
  avatar: [{ time: 0, corner: 'bottom-right' }],
  completed: false,
};

describe('details', () => {
  it('change what was given and nothing else', () => {
    const next = setDetails(lesson, { title: 'A box', level: undefined });
    expect(next.title).toBe('A box');
    expect(next.level).toBeUndefined();
    expect(next.description).toBe('');
    expect(setCompleted(lesson, true).completed).toBe(true);
    expect(lesson.title).toBe('Box');
  });
});

describe('chapters', () => {
  it('can be renamed', () => {
    expect(renameChapter(lesson, 1, 'Draw the base').states[1]?.title).toBe('Draw the base');
  });

  it('can be removed, except the first', () => {
    expect(canRemoveChapter(lesson, 0)).toBe(false);
    expect(canRemoveChapter(lesson, 2)).toBe(true);
    expect(removeChapter(lesson, 0).states).toHaveLength(3);
    expect(removeChapter(lesson, 1).states.map((s) => s.title)).toEqual(['Start', 'Extrude']);
  });

  it('can be moved, all but the first, and keep their model', () => {
    const moved = moveChapter(lesson, 1, 70);
    expect(moved.states.map((s) => [s.time, s.title, s.project])).toEqual([
      [0, 'Start', 'a'],
      [60, 'Extrude', 'c'],
      [70, 'Sketch', 'b'],
    ]);
    expect(moveChapter(lesson, 0, 5)).toBe(lesson);
    expect(moveChapter(lesson, 2, 500).states[2]?.time).toBe(100);
  });

  it('can be added at a moment, with the model in effect there', () => {
    const next = addChapterAt(lesson, 40, 'Check the sketch');
    expect(next.states.map((s) => [s.time, s.title, s.project])).toEqual([
      [0, 'Start', 'a'],
      [20, 'Sketch', 'b'],
      [40, 'Check the sketch', 'b'],
      [60, 'Extrude', 'c'],
    ]);
  });
});

describe('trimming', () => {
  it('leaves a stretch out and can put it back', () => {
    const trimmed = removeStretch(lesson, 30, 50);
    expect(trimmed.cuts).toEqual([
      { start: 0, end: 30 },
      { start: 50, end: 100 },
    ]);
    const twice = removeStretch(trimmed, 45, 70);
    expect(twice.cuts).toEqual([
      { start: 0, end: 30 },
      { start: 70, end: 100 },
    ]);
    expect(restoreStretch(twice, 30, 70).cuts).toEqual([{ start: 0, end: 100 }]);
  });

  it('takes the ends in either order and ignores an empty stretch', () => {
    expect(removeStretch(lesson, 50, 30).cuts).toEqual(removeStretch(lesson, 30, 50).cuts);
    expect(removeStretch(lesson, 30, 30)).toBe(lesson);
  });

  it('can remove the very start and the very end', () => {
    const next = removeStretch(removeStretch(lesson, 0, 10), 90, 100);
    expect(keptStretches(next)).toEqual([{ start: 10, end: 90 }]);
  });
});

describe('the camera', () => {
  it('sits in a corner from a moment on, one cue per moment', () => {
    const next = setCameraCorner(setCameraCorner(lesson, 30, 'top-left'), 30, 'top-right');
    expect(next.avatar).toEqual([
      { time: 0, corner: 'bottom-right' },
      { time: 30, corner: 'top-right' },
    ]);
    expect(removeCameraCue(next, 1).avatar).toEqual([{ time: 0, corner: 'bottom-right' }]);
  });
});
