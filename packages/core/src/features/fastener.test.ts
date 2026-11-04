/**
 * Every fastener against its standard, measured on the finished solid from the real kernel. The
 * numbers here are copied from the standards' tables on their own, not from `fastener-shape.ts`,
 * so a wrong entry there cannot agree with itself.
 */

import type { GeometryKernel, ShapeId } from '@bezier/kernel';
import { createOcctKernel } from '@bezier/kernel/occt';
import { beforeAll, describe, expect, it } from 'vitest';
import { fastenerFeature } from './fastener.js';
import { FASTENERS, type Fastener, fastenerExists, fastenerLengths } from './fastener-shape.js';
import { METRIC_SIZES } from './iso-metric.js';

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

// size, thread, ISO 4762: dk, k, s, t; ISO 273 clearance is in `iso-metric.ts`
const ISO_4762: Record<string, readonly [number, number, number, number]> = {
  M2: [3.8, 2, 1.5, 1],
  'M2.5': [4.5, 2.5, 2, 1.1],
  M3: [5.5, 3, 2.5, 1.3],
  M4: [7, 4, 3, 2],
  M5: [8.5, 5, 4, 2.5],
  M6: [10, 6, 5, 3],
  M8: [13, 8, 6, 4],
  M10: [16, 10, 8, 5],
  M12: [18, 12, 10, 6],
};
// ISO 4017: s, k
const ISO_4017: Record<string, readonly [number, number]> = {
  M2: [4, 1.4],
  'M2.5': [5, 1.7],
  M3: [5.5, 2],
  M4: [7, 2.8],
  M5: [8, 3.5],
  M6: [10, 4],
  M8: [13, 5.3],
  M10: [16, 6.4],
  M12: [18, 7.5],
};
// ISO 10642: dk theoretical, k
const ISO_10642: Record<string, readonly [number, number]> = {
  M3: [6.72, 1.86],
  M4: [8.96, 2.48],
  M5: [11.2, 3.1],
  M6: [13.44, 3.72],
  M8: [17.92, 4.96],
  M10: [22.4, 6.2],
  M12: [26.88, 7.44],
};
// ISO 4032: s, m max
const ISO_4032: Record<string, readonly [number, number]> = {
  M2: [4, 1.6],
  'M2.5': [5, 2],
  M3: [5.5, 2.4],
  M4: [7, 3.2],
  M5: [8, 4.7],
  M6: [10, 5.2],
  M8: [13, 6.8],
  M10: [16, 8.4],
  M12: [18, 10.8],
};
// ISO 7089: d1, d2, h
const ISO_7089: Record<string, readonly [number, number, number]> = {
  M2: [2.2, 5, 0.3],
  'M2.5': [2.7, 6, 0.5],
  M3: [3.2, 7, 0.5],
  M4: [4.3, 9, 0.8],
  M5: [5.3, 10, 1],
  M6: [6.4, 12, 1.6],
  M8: [8.4, 16, 1.6],
  M10: [10.5, 20, 2],
  M12: [13, 24, 2.5],
};

describe('fasteners, measured', () => {
  let kernel: GeometryKernel;
  beforeAll(async () => {
    kernel = await createOcctKernel();
  }, 60_000);

  const build = async (params: Record<string, unknown>) => {
    const done = must(
      await fastenerFeature.rebuild(
        kernel,
        {
          kind: 'socket-head',
          size: 'M5',
          length: 20,
          plane: 'XY',
          placement: '',
          thread: false,
          ...params,
        } as never,
        { body: null } as never,
      ),
    );
    return done.body as ShapeId;
  };
  const size = async (shape: ShapeId) => {
    const { min, max } = must(await kernel.bounds(shape));
    return { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z, min, max };
  };
  const volume = async (shape: ShapeId) => must(await kernel.massProperties(shape)).volume;
  const all = FASTENERS.flatMap((kind) =>
    METRIC_SIZES.filter((metric) => fastenerExists(kind, metric.name)).map((metric) => [
      kind,
      metric.name,
    ]),
  ) as [Fastener, string][];

  it.each(all)(
    '%s %s, at each length the standard has, is one solid',
    async (kind, name) => {
      const lengths = fastenerLengths(kind, name);
      for (const length of lengths.length > 0 ? [lengths[0], lengths.at(-1)] : [20]) {
        const part = await build({ kind, size: name, length });
        expect(await volume(part)).toBeGreaterThan(0);
        expect(must(await kernel.subShapes(part, 'solid' as never)).length).toBe(1);
      }
    },
    60_000,
  );

  it.each(Object.entries(ISO_4762))(
    'ISO 4762 %s',
    async (name, [dk, k, s, t]) => {
      const [length] = fastenerLengths('socket-head', name);
      const part = await build({ kind: 'socket-head', size: name, length });
      const measured = await size(part);
      expect(measured.max.z).toBeCloseTo(k, 3);
      expect(measured.min.z).toBeCloseTo(-(length as number), 3);
      expect(measured.x).toBeCloseTo(dk, 2);
      // What the socket takes out: a hexagon of the key's flats, as deep as the table says.
      const hexagon = (Math.sqrt(3) / 2) * s ** 2;
      const nominal =
        (Math.PI * (METRIC_SIZES.find((m) => m.name === name)?.nominal ?? 0) ** 2) / 4;
      const solid = Math.PI * (dk / 2) ** 2 * k + nominal * (length as number);
      const taken = solid - (await volume(part));
      expect(taken).toBeGreaterThan(hexagon * t * 0.95);
    },
    60_000,
  );

  it.each(Object.entries(ISO_4017))(
    'ISO 4017 %s',
    async (name, [s, k]) => {
      const [length] = fastenerLengths('hex-bolt', name);
      const measured = await size(await build({ kind: 'hex-bolt', size: name, length }));
      expect(measured.max.z).toBeCloseTo(k, 3);
      expect(measured.y).toBeCloseTo(s, 2);
      expect(measured.min.z).toBeCloseTo(-(length as number), 3);
    },
    60_000,
  );

  it.each(Object.entries(ISO_10642))(
    'ISO 10642 %s',
    async (name, [dk, k]) => {
      const [length] = fastenerLengths('countersunk', name);
      const part = await build({ kind: 'countersunk', size: name, length });
      const measured = await size(part);
      expect(measured.max.z).toBeCloseTo(0, 3);
      expect(measured.min.z).toBeCloseTo(-(length as number), 3);
      expect(measured.x).toBeCloseTo(dk, 2);
      // The cone is 90°: from the shank to the theoretical diameter in the table's head height.
      const nominal = METRIC_SIZES.find((m) => m.name === name)?.nominal ?? 0;
      expect((dk - nominal) / 2).toBeCloseTo(k, 2);
    },
    60_000,
  );

  it.each(Object.entries(ISO_4032))(
    'ISO 4032 %s',
    async (name, [s, m]) => {
      const measured = await size(await build({ kind: 'hex-nut', size: name }));
      expect(measured.z).toBeCloseTo(m, 3);
      expect(measured.y).toBeCloseTo(s, 2);
      // Across corners, with the chamfer taken off: at least the table's e min, which is 1.13 s.
      expect(measured.x).toBeGreaterThan(s * 1.08);
    },
    60_000,
  );

  it.each(Object.entries(ISO_7089))(
    'ISO 7089 %s',
    async (name, [d1, d2, h]) => {
      const part = await build({ kind: 'washer', size: name });
      const measured = await size(part);
      expect(measured.x).toBeCloseTo(d2, 2);
      expect(measured.z).toBeCloseTo(h, 3);
      expect(await volume(part)).toBeCloseTo((Math.PI * (d2 ** 2 - d1 ** 2) * h) / 4, 1);
    },
    60_000,
  );

  it('ISO 10642 has nothing below M3', () => {
    expect(fastenerExists('countersunk', 'M2.5')).toBe(false);
    expect(fastenerExists('countersunk', 'M3')).toBe(true);
    expect(fastenerExists('socket-head', 'M2')).toBe(true);
  });

  it('offers the commercial lengths of each standard', () => {
    expect(fastenerLengths('socket-head', 'M5')).toEqual([
      8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50,
    ]);
    expect(fastenerLengths('hex-bolt', 'M8').at(0)).toBe(16);
    expect(fastenerLengths('hex-bolt', 'M12').at(-1)).toBe(120);
    expect(fastenerLengths('countersunk', 'M12')).toEqual([
      20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100,
    ]);
    expect(fastenerLengths('hex-nut', 'M5')).toEqual([]);
  });

  it('refuses what no standard has, and says what there is', async () => {
    const odd = await fastenerFeature.rebuild(
      kernel,
      {
        kind: 'socket-head',
        size: 'M5',
        length: 33,
        plane: 'XY',
        placement: '',
        thread: false,
      } as never,
      { body: null } as never,
    );
    expect(odd.ok).toBe(false);
    if (!odd.ok) expect(odd.error.message).toContain('30, 35');
    const small = await fastenerFeature.rebuild(
      kernel,
      {
        kind: 'countersunk',
        size: 'M2',
        length: 8,
        plane: 'XY',
        placement: '',
        thread: false,
      } as never,
      { body: null } as never,
    );
    expect(small.ok).toBe(false);
  }, 60_000);

  it('stands at a point on a face, head outward', async () => {
    const placement = JSON.stringify({
      origin: { x: 10, y: 5, z: 2 },
      normal: { x: 1, y: 0, z: 0 },
    });
    const { max, min } = await size(
      await build({ kind: 'socket-head', size: 'M4', length: 12, placement }),
    );
    expect(max.x).toBeCloseTo(14, 2);
    expect(min.x).toBeCloseTo(-2, 2);
  }, 60_000);

  it('refuses a broken placement', async () => {
    const done = await fastenerFeature.rebuild(
      kernel,
      {
        kind: 'washer',
        size: 'M5',
        length: 20,
        plane: 'XY',
        placement: '{',
        thread: false,
      } as never,
      { body: null } as never,
    );
    expect(done.ok).toBe(false);
  }, 60_000);

  it.each([
    ['socket-head', 'M6', 16],
    ['hex-bolt', 'M8', 30],
    ['countersunk', 'M5', 16],
    ['hex-nut', 'M12', 20],
  ] as const)(
    '%s %s can have a modelled thread and stays one solid',
    async (kind, name, length) => {
      const part = await build({ kind, size: name, length, thread: true });
      expect(await volume(part)).toBeGreaterThan(0);
      expect(must(await kernel.subShapes(part, 'solid' as never)).length).toBe(1);
      expect(must(await kernel.subShapes(part, 'face')).length).toBeGreaterThan(8);
    },
    60_000,
  );

  it('a long socket screw is threaded only to the reference length of the table', async () => {
    const short = await build({ kind: 'socket-head', size: 'M6', length: 30, thread: true });
    const long = await build({ kind: 'socket-head', size: 'M6', length: 60, thread: true });
    const plain = await build({ kind: 'socket-head', size: 'M6', length: 60 });
    const takenShort =
      (await volume(await build({ kind: 'socket-head', size: 'M6', length: 30 }))) -
      (await volume(short));
    const takenLong = (await volume(plain)) - (await volume(long));
    // b = 24 of 60 mm threaded: less than the 30 mm of the screw threaded to the head.
    expect(takenLong).toBeLessThan(takenShort);
  }, 60_000);
});
