/** Files written in parts and joined: the joined file reads back as all the parts, where they were. */
import { describe, expect, it } from 'vitest';
import type { KernelResult } from './errors.js';
import { joinStep, joinStl } from './export-parts.js';
import type { Profile } from './kernel.js';
import { createOcctKernel } from './occt-kernel.js';

function value<T>(r: KernelResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.message}: ${r.error.detail}`);
  return r.value;
}

const square = (x: number): Profile => ({
  loops: [
    [
      { kind: 'line', start: { x, y: 0 }, end: { x: x + 10, y: 0 } },
      { kind: 'line', start: { x: x + 10, y: 0 }, end: { x: x + 10, y: 10 } },
      { kind: 'line', start: { x: x + 10, y: 10 }, end: { x, y: 10 } },
      { kind: 'line', start: { x, y: 10 }, end: { x, y: 0 } },
    ],
  ],
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDirection: { x: 1, y: 0, z: 0 },
});

describe('writing in parts', () => {
  it('joins two STEP files into one that holds both solids', async () => {
    const kernel = await createOcctKernel();
    const a = value(await kernel.extrude(square(0), 5));
    const b = value(await kernel.extrude(square(50), 5));
    // A quote and a hash in a name must survive as text.
    const named = (text: string) => text.replace("PRODUCT('", "PRODUCT('it''s #1 ");
    const joined = joinStep([
      named(value(await kernel.exportStep(a))),
      value(await kernel.exportStep(b)),
    ]);
    expect(joined).toContain("it''s #1 ");
    const back = value(await kernel.importStep(joined));
    expect(value(await kernel.solidFaceGroups(back))).toHaveLength(2);
    const box = value(await kernel.bounds(back));
    expect(box.min.x).toBeCloseTo(0);
    expect(box.max.x).toBeCloseTo(60);
  });

  it('joins binary STL files, adding up their triangles', async () => {
    const kernel = await createOcctKernel();
    const a = value(await kernel.exportStl(value(await kernel.extrude(square(0), 5))));
    const b = value(await kernel.exportStl(value(await kernel.extrude(square(50), 5))));
    const count = (stl: Uint8Array) => new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);
    const joined = joinStl([a, b]);
    expect(count(joined)).toBe(count(a) + count(b));
    expect(joined.length).toBe(84 + 50 * count(joined));
  });
});
