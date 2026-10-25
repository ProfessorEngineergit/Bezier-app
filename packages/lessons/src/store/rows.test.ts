import { describe, expect, it } from 'vitest';
import type { LessonManifest } from '../format/manifest.js';
import { isLessonRow, rowBytes, rowFromLesson, rowToLesson } from './rows.js';

const manifest: LessonManifest = {
  format: 'bezier-lesson',
  version: 1,
  id: 'one',
  title: 'Box',
  description: '',
  createdAt: '2026-09-28T20:05:25.808Z',
  duration: 1,
  viewportType: 'video/webm',
  cameraType: 'video/webm',
  events: [],
  states: [{ time: 0, title: 'Start', project: '{}' }],
  cuts: [{ start: 0, end: 1 }],
  avatar: [],
  completed: false,
};

describe('a stored row', () => {
  it('reads media stored as bytes', () => {
    const row = { id: 'one', manifest, viewportBytes: new Uint8Array([1, 2, 3]) };
    expect(isLessonRow(row)).toBe(true);
    const lesson = rowToLesson(row);
    expect(lesson.viewport.size).toBe(3);
    expect(lesson.viewport.type).toBe('video/webm');
    expect(lesson.camera).toBeUndefined();
    expect(rowBytes(row)).toBe(3);
  });

  it('still reads the older rows that hold blobs', () => {
    const row = {
      id: 'one',
      manifest,
      viewport: new Blob([new Uint8Array(4)]),
      camera: new Blob([new Uint8Array(2)]),
    };
    expect(isLessonRow(row)).toBe(true);
    const lesson = rowToLesson(row);
    expect(lesson.viewport.size).toBe(4);
    expect(lesson.camera?.size).toBe(2);
    expect(rowBytes(row)).toBe(6);
  });

  it('says plainly when the recording is gone', () => {
    expect(() => rowToLesson({ id: 'one', manifest })).toThrow(/lost its recording/);
  });

  it('writes bytes, never blobs, and comes back the same', async () => {
    const row = await rowFromLesson({
      manifest,
      viewport: new Blob([new Uint8Array([9, 9])]),
      camera: new Blob([new Uint8Array([1])]),
    });
    expect(row.viewportBytes).toEqual(new Uint8Array([9, 9]));
    expect(row.cameraBytes).toEqual(new Uint8Array([1]));
    expect(row.viewport).toBeUndefined();
    expect(rowToLesson(row).camera?.size).toBe(1);
  });

  it('leaves what is not a lesson alone', () => {
    expect(isLessonRow({ id: 'x', manifest: { format: 'other' } })).toBe(false);
    expect(isLessonRow(null)).toBe(false);
  });
});
