import { LARGE_MODEL_FACES, LIGHTWEIGHT_TESSELLATION } from '@bezier/core';
import type { DisplayGeometry } from '@bezier/renderer';
import { describe, expect, it } from 'vitest';
import { type Drawing, drawsTheSame } from './session-drawn.js';
import { tessellationChoice } from './use-quality.js';

const drawingOf = (faces: number, tessellation: Drawing['tessellation']): Drawing => ({
  tessellation,
  bodies: [],
  display: { faceRefs: new Array(faces).fill(null) } as unknown as DisplayGeometry,
});

describe('taking a drawing again for another setting', () => {
  it('takes it when Light comes to what Automatic already drew for a large model', () => {
    const auto = tessellationChoice('medium', 'auto');
    const light = tessellationChoice('medium', 'light');
    expect(light).toBe(LIGHTWEIGHT_TESSELLATION);
    expect(drawsTheSame(drawingOf(LARGE_MODEL_FACES + 1, auto), light)).toBe(true);
  });

  it('draws again where the setting changes the triangles', () => {
    const auto = tessellationChoice('medium', 'auto');
    const light = tessellationChoice('medium', 'light');
    expect(drawsTheSame(drawingOf(100, auto), light)).toBe(false);
  });
});
