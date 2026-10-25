import type { StableRef } from '@bezier/core';
import { BufferAttribute, BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { type FacePiece, PresentationFaces } from './presentation-faces.js';

const ref = (tag: string) => ({ kind: 'face', feature: 'box', tag }) as StableRef;

/** Two faces of two triangles each, six vertices a face, painted white. */
function piece(): { piece: FacePiece; colours: BufferAttribute } {
  const geometry = new BufferGeometry();
  const colours = new BufferAttribute(new Float32Array(12 * 3).fill(1), 3);
  geometry.setAttribute('color', colours);
  geometry.setIndex(
    new BufferAttribute(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 1),
  );
  return { piece: { body: 'b', geometry, faces: new Uint32Array([0, 0, 1, 1]) }, colours };
}

const at = (colours: BufferAttribute, vertex: number) =>
  [colours.getX(vertex), colours.getY(vertex), colours.getZ(vertex)].map((v) =>
    Math.round(v * 255),
  );

describe('colouring single faces', () => {
  it('writes a face its colour and leaves the others white', () => {
    const { piece: one, colours } = piece();
    const faces = new PresentationFaces();
    faces.setPieces([one], [ref('side-0'), ref('side-1')]);
    faces.paint({ colours: { 'F:box:side-1': '#ff0000' }, hover: null, selected: [] });
    expect(at(colours, 0)).toEqual([255, 255, 255]);
    expect(at(colours, 7)).toEqual([255, 0, 0]);
  });

  it('takes a colour back off when it is cleared', () => {
    const { piece: one, colours } = piece();
    const faces = new PresentationFaces();
    faces.setPieces([one], [ref('side-0'), ref('side-1')]);
    faces.paint({ colours: { 'F:box:side-0': '#00ff00' }, hover: null, selected: [] });
    faces.paint({ colours: {}, hover: null, selected: [] });
    expect(at(colours, 2)).toEqual([255, 255, 255]);
  });

  it('tints the face under the pointer and the picked ones towards the accent, picked more', () => {
    const { piece: one, colours } = piece();
    const faces = new PresentationFaces();
    faces.setPieces([one], [ref('side-0'), ref('side-1')]);
    faces.paint({ colours: {}, hover: 'F:box:side-0', selected: ['F:box:side-1'] });
    const hover = at(colours, 0)[0] ?? 255;
    const picked = at(colours, 7)[0] ?? 255;
    expect(hover).toBeLessThan(255);
    expect(picked).toBeLessThan(hover);
  });

  it('repaints a new mesh with what was set before it arrived', () => {
    const faces = new PresentationFaces();
    faces.paint({ colours: { 'F:box:side-0': '#0000ff' }, hover: null, selected: [] });
    const { piece: later, colours } = piece();
    faces.setPieces([later], [ref('side-0'), ref('side-1')]);
    expect(at(colours, 1)).toEqual([0, 0, 255]);
  });
});
