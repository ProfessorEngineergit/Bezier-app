import { describe, expect, it } from 'vitest';
import type { LessonManifest } from './manifest.js';
import { addZoom, focusOn, removeZoom, setZoomScale, zoomAt, zoomsAt } from './zoom.js';

const lesson: LessonManifest = {
  format: 'bezier-lesson',
  version: 1,
  id: 'one',
  title: 'Box',
  description: '',
  createdAt: '2026-09-28T20:05:25.808Z',
  duration: 100,
  viewportType: 'video/webm',
  events: [],
  states: [{ time: 0, title: 'Start', project: 'a' }],
  cuts: [{ start: 0, end: 100 }],
  avatar: [],
  completed: false,
  zooms: [{ start: 10, end: 20, scale: 2 }],
};

describe('the zoom', () => {
  it('is full inside a stretch, one outside, and ramps at the edges', () => {
    expect(zoomAt(lesson, 15)).toBe(2);
    expect(zoomAt(lesson, 5)).toBe(1);
    expect(zoomAt(lesson, 30)).toBe(1);
    const half = zoomAt(lesson, 10 - 0.2);
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(2);
    expect(zoomAt({}, 15)).toBe(1);
    expect(zoomsAt(lesson, 15)).toBe(0);
    expect(zoomsAt(lesson, 25)).toBe(-1);
  });

  it('keeps the view where it is until the pointer strays, and never past the edge', () => {
    const centre = { x: 0.5, y: 0.5 };
    expect(focusOn(centre, { x: 0.55, y: 0.45 }, 2)).toEqual(centre);
    expect(focusOn(centre, { x: 0.9, y: 0.5 }, 2).x).toBeCloseTo(0.75);
    expect(focusOn(centre, { x: 0.99, y: 0.01 }, 2)).toEqual({ x: 0.75, y: 0.25 });
    expect(focusOn(centre, undefined, 2)).toEqual(centre);
    expect(focusOn({ x: 0, y: 0 }, undefined, 1)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('can be added, changed and removed; overlaps replace', () => {
    const two = addZoom(lesson, { start: 40, end: 50, scale: 1.5 });
    expect(two.zooms?.map((z) => z.start)).toEqual([10, 40]);
    const over = addZoom(two, { start: 15, end: 45, scale: 3 });
    expect(over.zooms).toEqual([{ start: 15, end: 45, scale: 3 }]);
    expect(setZoomScale(two, 1, 3).zooms?.[1]?.scale).toBe(3);
    expect(addZoom(lesson, { start: 1, end: 1.1, scale: 2 })).toBe(lesson);
    const none = removeZoom(lesson, 0);
    expect('zooms' in none).toBe(false);
  });
});
