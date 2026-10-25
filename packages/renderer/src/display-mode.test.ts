/**
 * Display modes. Wireframe shows the model's edges, not the tessellation (`material.wireframe`).
 */

import { describe, expect, it } from 'vitest';
import { visibilityFor } from './display-mode.js';

describe('what each display mode draws', () => {
  it('shows the shaded body, and edges only when they are switched on', () => {
    expect(visibilityFor('shaded', false, true)).toEqual({ body: true, edges: true });
    expect(visibilityFor('shaded', false, false)).toEqual({ body: true, edges: false });
  });

  it('draws the edges instead of the body in wireframe', () => {
    expect(visibilityFor('wireframe', false, true)).toEqual({ body: false, edges: true });
  });

  it('keeps the edges in wireframe even when edges are switched off', () => {
    // Otherwise the mode draws nothing at all, which is how it would read if the user had turned
    // edges off before choosing it.
    expect(visibilityFor('wireframe', false, false)).toEqual({ body: false, edges: true });
  });

  it('keeps the body for x-ray, which is the body made see-through', () => {
    expect(visibilityFor('xray', false, true)).toEqual({ body: true, edges: true });
  });

  it('hides the body while results stand in for it, in every mode', () => {
    expect(visibilityFor('shaded', true, true).body).toBe(false);
    expect(visibilityFor('xray', true, true).body).toBe(false);
    expect(visibilityFor('wireframe', true, true).body).toBe(false);
  });

  it('brings the body back when the results go, unless wireframe still holds it', () => {
    expect(visibilityFor('shaded', false, true).body).toBe(true);
    expect(visibilityFor('wireframe', false, true).body).toBe(false);
  });
});
