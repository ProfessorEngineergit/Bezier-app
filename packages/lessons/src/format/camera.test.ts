import { describe, expect, it } from 'vitest';
import { cameraCornerAt, chosenCorner } from './camera.js';
import type { LessonManifest } from './manifest.js';

const lesson: Pick<LessonManifest, 'avatar' | 'events'> = {
  avatar: [
    { time: 0, corner: 'bottom-right' },
    { time: 30, corner: 'top-left' },
  ],
  events: [
    { kind: 'pointer', time: 10, x: 0.9, y: 0.9 },
    { kind: 'click', time: 10, x: 0.9, y: 0.9, button: 0 },
  ],
};

describe('the camera corner', () => {
  it('is the one the author chose from that moment on', () => {
    expect(chosenCorner(lesson.avatar, 0)).toBe('bottom-right');
    expect(chosenCorner(lesson.avatar, 31)).toBe('top-left');
  });

  it('moves three seconds before the pointer reaches it and does not jump back at the click', () => {
    expect(cameraCornerAt(lesson, 6)).toBe('bottom-right');
    expect(cameraCornerAt(lesson, 7)).toBe('top-left');
    expect(cameraCornerAt(lesson, 10.5)).toBe('top-left');
    expect(cameraCornerAt(lesson, 12.1)).toBe('bottom-right');
  });
});
