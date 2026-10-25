import type { BodySummary, FaceRef, StableRef } from '@bezier/core';
import { expect, it } from 'vitest';
import { moveTarget } from './move-selection.js';

const face = (tag: string): FaceRef => ({ kind: 'face', feature: 'extrude-1', tag });
const body = (...tags: string[]): BodySummary =>
  ({ key: tags.join(), faces: tags.map(face) }) as unknown as BodySummary;
const edge = (a: string, b: string): StableRef => ({ kind: 'edge', faces: [face(a), face(b)] });

it('moves the whole body when all its faces are picked', () => {
  const target = moveTarget([body('a', 'b', 'c')], [face('a'), face('b'), face('c')]);
  expect(target.kind).toBe('bodies');
});

it('moves one face by itself when only that face is picked', () => {
  const target = moveTarget([body('a', 'b', 'c')], [face('a')]);
  expect(target).toEqual({ kind: 'parts', faces: [face('a')], edges: [], vertices: [] });
});

it('moves one edge by itself', () => {
  const target = moveTarget([body('a', 'b', 'c')], [edge('a', 'b')]);
  expect(target.kind).toBe('parts');
});

it('keeps only the whole bodies when whole bodies and loose faces are mixed', () => {
  const target = moveTarget([body('a', 'b'), body('c', 'd')], [face('a'), face('b'), face('c')]);
  expect(target).toEqual({ kind: 'bodies', faces: [face('a'), face('b')] });
});

it('keeps the old meaning for nothing picked', () => {
  expect(moveTarget([body('a')], []).kind).toBe('bodies');
});
