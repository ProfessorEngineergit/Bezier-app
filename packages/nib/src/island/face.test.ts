import { describe, expect, it } from 'vitest';
import { FACES, faceTransforms } from './face.js';

describe('his faces', () => {
  it('never shut both eyes while he is awake', () => {
    for (const [mood, face] of Object.entries(FACES)) {
      const covered = face.top + Math.min(face.bottom, 1 - face.top);
      expect(covered, mood).toBeLessThan(mood === 'sleepy' ? 0.75 : 0.65);
    }
  });

  it('keeps the lenses inside their rings', () => {
    for (const face of Object.values(FACES)) {
      expect(Math.abs(face.gazeX)).toBeLessThanOrEqual(1);
      expect(Math.abs(face.gazeY)).toBeLessThanOrEqual(1);
    }
  });

  it('turns the brows opposite ways, so worry lifts both inner ends', () => {
    const t = faceTransforms(FACES.worried);
    expect(t.browLeft).toContain('rotate(-12deg)');
    expect(t.browRight).toContain('rotate(12deg)');
  });

  it('lets the lower lid cover only what the upper one leaves', () => {
    const t = faceTransforms({ ...FACES.rest, top: 0.7, bottom: 0.6 });
    expect(t.top).toBe('scaleY(0.7)');
    expect(t.bottom).toBe('scaleY(0.3)');
  });

  it('moves the lens by the gaze, clamped', () => {
    expect(faceTransforms({ ...FACES.rest, gazeX: 3, gazeY: -0.5 }).lens).toBe(
      'translate(1.1px, -0.55px)',
    );
  });
});
