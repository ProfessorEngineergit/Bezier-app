/** The rough STEP outline, compared with OCCT's own reading of an OCCT-written file. */

import { beforeAll, describe, expect, it } from 'vitest';
import { parseStepOutline } from './step-outline.js';
import { loadOcct } from './wasm.js';

type Occt = Awaited<ReturnType<typeof loadOcct>>;

describe('a STEP outline read from the text', () => {
  let occt: Occt;

  beforeAll(async () => {
    occt = await loadOcct();
  }, 120_000);

  it('draws every edge of a box, where the box is', () => {
    const box = occt.makeBox(10, 20, 30);
    const outline = parseStepOutline(occt.exportStep(box));
    expect(outline).not.toBeNull();
    if (outline === null) return;
    expect(outline.edges.polylineStarts.length).toBe(occt.subShapeCount(box, 'edge'));
    expect(outline.box.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(outline.box.max).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('draws a circle round, not as the chord between its ends', () => {
    const cylinder = occt.makeCylinder(5, 10);
    const outline = parseStepOutline(occt.exportStep(cylinder));
    if (outline === null) throw new Error('no outline');
    // A closed circular edge starts and ends at one vertex: its chord is a point.
    expect(outline.box.min.x).toBeCloseTo(-5, 1);
    expect(outline.box.max.y).toBeCloseTo(5, 1);
    expect(outline.box.max.z).toBeCloseTo(10, 5);
  });

  it('places each part of a compound where OCCT does', () => {
    const moved = occt.translate(occt.makeBox(1, 1, 1), 100, 0, 0);
    const both = occt.makeCompound([occt.makeBox(1, 1, 1), moved]);
    const outline = parseStepOutline(occt.exportStep(both));
    if (outline === null) throw new Error('no outline');
    expect(outline.box.max.x).toBeCloseTo(101, 5);
    expect(outline.edges.polylineStarts.length).toBe(24);
  });

  it('finds nothing in a file without edges', () => {
    expect(
      parseStepOutline('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;'),
    ).toBeNull();
  });
});
