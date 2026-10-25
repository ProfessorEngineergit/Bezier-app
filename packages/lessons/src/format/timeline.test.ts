import { describe, expect, it } from 'vitest';
import {
  chapterAt,
  chapterSegments,
  chapters,
  keptStretches,
  nextChapter,
  playableDuration,
  playableMoment,
  previousChapter,
  removedStretches,
  toLesson,
  toPlayback,
} from './timeline.js';

const lesson = {
  duration: 100,
  cuts: [
    { start: 0, end: 30 },
    { start: 50, end: 100 },
  ],
  states: [
    { time: 0, title: 'Start', project: 'a' },
    { time: 20, title: 'Sketch', project: 'b' },
    { time: 40, title: 'Trimmed away', project: 'c' },
    { time: 60, title: 'Extrude', project: 'd' },
  ],
};

describe('the kept stretches', () => {
  it('are the cuts, cleaned up', () => {
    expect(keptStretches(lesson)).toEqual([
      { start: 0, end: 30 },
      { start: 50, end: 100 },
    ]);
  });

  it('merge overlaps, drop empty ones and stay inside the recording', () => {
    expect(
      keptStretches({
        duration: 10,
        cuts: [
          { start: 4, end: 8 },
          { start: -2, end: 5 },
          { start: 3, end: 3 },
          { start: 9, end: 40 },
        ],
      }),
    ).toEqual([
      { start: 0, end: 8 },
      { start: 9, end: 10 },
    ]);
  });

  it('play everything when nothing was kept, which nobody can have meant', () => {
    expect(keptStretches({ duration: 10, cuts: [] })).toEqual([{ start: 0, end: 10 }]);
    expect(keptStretches({ duration: 10, cuts: [{ start: 2, end: 2 }] })).toEqual([
      { start: 0, end: 10 },
    ]);
  });

  it('have the removed stretches as their complement', () => {
    expect(removedStretches(lesson)).toEqual([{ start: 30, end: 50 }]);
    expect(removedStretches({ duration: 10, cuts: [{ start: 2, end: 8 }] })).toEqual([
      { start: 0, end: 2 },
      { start: 8, end: 10 },
    ]);
  });
});

describe('playback time', () => {
  const kept = keptStretches(lesson);

  it('leaves the removed stretch out', () => {
    expect(playableDuration(kept)).toBe(80);
    expect(toPlayback(kept, 10)).toBe(10);
    expect(toPlayback(kept, 30)).toBe(30);
    expect(toPlayback(kept, 40)).toBe(30);
    expect(toPlayback(kept, 60)).toBe(40);
    expect(toPlayback(kept, 500)).toBe(80);
  });

  it('maps back to lesson time', () => {
    expect(toLesson(kept, 10)).toBe(10);
    expect(toLesson(kept, 30)).toBe(30);
    expect(toLesson(kept, 40)).toBe(60);
    expect(toLesson(kept, 80)).toBe(100);
    expect(toLesson(kept, 90)).toBe(100);
  });

  it('knows where the video should be', () => {
    expect(playableMoment(kept, 10)).toBe(10);
    expect(playableMoment(kept, 40)).toBe(50);
    expect(playableMoment(kept, 100)).toBeNull();
  });
});

describe('chapters', () => {
  const kept = keptStretches(lesson);
  const list = chapters(lesson, kept);

  it('are the checkpoints in time order, placed in playback time', () => {
    expect(list.map((c) => [c.index, c.title, c.playback])).toEqual([
      [0, 'Start', 0],
      [1, 'Sketch', 20],
      [2, 'Trimmed away', 30],
      [3, 'Extrude', 40],
    ]);
  });

  it('sort checkpoints written out of order', () => {
    const shuffled = chapters(
      {
        states: [lesson.states[3], lesson.states[0], lesson.states[1]].filter(
          (s) => s !== undefined,
        ),
      },
      kept,
    );
    expect(shuffled.map((c) => c.title)).toEqual(['Start', 'Sketch', 'Extrude']);
  });

  it('find the one a moment is in', () => {
    expect(chapterAt(list, 0)?.title).toBe('Start');
    expect(chapterAt(list, 19.97)?.title).toBe('Start');
    expect(chapterAt(list, 20)?.title).toBe('Sketch');
    expect(chapterAt(list, 59)?.title).toBe('Trimmed away');
    expect(chapterAt(list, 99)?.title).toBe('Extrude');
  });

  it('step forward and back like a track button', () => {
    expect(nextChapter(list, 0)?.title).toBe('Sketch');
    expect(nextChapter(list, 61)).toBeUndefined();
    expect(previousChapter(list, 21)?.title).toBe('Start');
    expect(previousChapter(list, 25)?.title).toBe('Sketch');
    expect(previousChapter(list, 1)?.title).toBe('Start');
  });

  it('give the scrub bar its segments; a chapter begun in a removed stretch starts where playback resumes', () => {
    expect(chapterSegments(list, 80).map((s) => [s.chapter.title, s.from, s.to])).toEqual([
      ['Start', 0, 20],
      ['Sketch', 20, 30],
      ['Trimmed away', 30, 40],
      ['Extrude', 40, 80],
    ]);
  });

  it('leave out a chapter that has no room of its own', () => {
    const crowded = chapters(
      {
        states: [
          { time: 0, title: 'Start', project: '' },
          { time: 40, title: 'Gone', project: '' },
          { time: 50, title: 'Next', project: '' },
        ],
      },
      kept,
    );
    expect(chapterSegments(crowded, 80).map((s) => s.chapter.title)).toEqual(['Start', 'Next']);
  });

  it('give a lesson with one chapter its one segment', () => {
    const one = chapters({ states: [{ time: 0, title: 'Start', project: '' }] }, [
      { start: 0, end: 0 },
    ]);
    expect(chapterSegments(one, 0)).toHaveLength(1);
  });
});
