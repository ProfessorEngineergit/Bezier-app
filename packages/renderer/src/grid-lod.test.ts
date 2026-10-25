import { describe, expect, it } from 'vitest';
import {
  apparentDistance,
  axisUnderPointer,
  CELL_PER_DISTANCE,
  foldOntoPattern,
  gridLevel,
  gridReach,
  groundReach,
} from './grid-lod.js';

describe('gridLevel', () => {
  it('only ever asks for round cells', () => {
    // Whatever the camera does, the lines fall at 1, 10, 100 and never at 3.7.
    for (let distance = 1; distance < 100_000; distance *= 1.07) {
      const { cell } = gridLevel(distance);
      const decade = Math.log10(cell);
      expect(decade).toBeCloseTo(Math.round(decade), 9);
    }
  });

  it('coarsens as the camera pulls back, and never the other way', () => {
    let previous = 0;
    for (let distance = 1; distance < 1_000_000; distance *= 1.3) {
      const { cell } = gridLevel(distance);
      expect(cell).toBeGreaterThanOrEqual(previous);
      previous = cell;
    }
  });

  it('fades the fine level out across a decade rather than switching it', () => {
    // Fine lines fade out across a decade, before they are a pixel apart; a hard switch makes the
    // grid pop while scrolling. Boundaries are where distance × CELL_PER_DISTANCE crosses a power
    // of ten, derived from the constant so retuning the density does not break these assertions.
    const justIn = gridLevel(10.05 / CELL_PER_DISTANCE);
    const nearEnd = gridLevel(99 / CELL_PER_DISTANCE);

    expect(justIn.blend).toBeGreaterThan(0.9);
    expect(nearEnd.blend).toBeLessThan(0.1);
  });

  it('keeps blend inside 0..1 everywhere', () => {
    for (let distance = 0.01; distance < 1_000_000; distance *= 1.11) {
      const { blend } = gridLevel(distance);
      expect(blend).toBeGreaterThanOrEqual(0);
      expect(blend).toBeLessThanOrEqual(1);
    }
  });

  it('hands over between decades without a gap in what is drawn', () => {
    // At the moment the fine level has faded out, its coarse partner must be the next level's fine
    // one, or the handover drops a decade and the ground briefly has no lines.
    const before = gridLevel(999 / CELL_PER_DISTANCE);
    const after = gridLevel(1001 / CELL_PER_DISTANCE);
    expect(after.cell).toBeCloseTo(before.cell * 10, 9);
  });

  it('survives a camera sitting on the plane', () => {
    // log10(0) is -Infinity, and a NaN cell size silently renders nothing.
    expect(gridLevel(0)).toEqual({ cell: 1, blend: 1 });
    expect(gridLevel(-5).cell).toBe(1);
    expect(gridLevel(Number.NaN).cell).toBe(1);
  });
});

describe('one spacing for the whole plane', () => {
  /**
   * The cell size comes from one viewing distance and reaches every fragment as a uniform. Derived
   * per fragment from `distance(vWorld, uCamera)`, the fine grid becomes a disc following the
   * camera, with rings of density sliding over the ground.
   */
  it('answers from the viewing distance alone, so every cell on screen matches', () => {
    // The spacing depends on the camera only, not on where on the plane the cursor is.
    const atCamera = gridLevel(240);
    expect(gridLevel(240)).toEqual(atCamera);

    // No per-point input: the only argument is how far the eye is from what it orbits.
    expect(gridLevel.length).toBe(1);
  });

  it('gives three nested levels that are decades apart', () => {
    // The shader draws cell, cell×10 and cell×100 together: squares inside squares inside squares.
    // Whatever the zoom, those stay round numbers.
    const { cell } = gridLevel(240);
    for (const level of [cell, cell * 10, cell * 100]) {
      const decade = Math.log10(level);
      expect(decade).toBeCloseTo(Math.round(decade), 9);
    }
  });
});

describe('apparentDistance', () => {
  it('passes a lens through unchanged, because a lens zooms by moving', () => {
    expect(apparentDistance({ isOrthographicCamera: false, zoom: 4 }, 240)).toBe(240);
    expect(apparentDistance({}, 240)).toBe(240);
  });

  it('divides a parallel view by its zoom, because that camera never moves', () => {
    // Scrolled 4× into a squared-up view, the grid must behave as though the eye were four times
    // closer. The raw distance would freeze the spacing once the view snaps to an axis.
    expect(apparentDistance({ isOrthographicCamera: true, zoom: 4 }, 240)).toBe(60);
    expect(
      gridLevel(apparentDistance({ isOrthographicCamera: true, zoom: 100 }, 240)).cell,
    ).toBeLessThan(gridLevel(240).cell);
  });

  it('survives a zoom of zero rather than dividing by it', () => {
    expect(apparentDistance({ isOrthographicCamera: true, zoom: 0 }, 240)).toBe(240);
  });
});

describe('foldOntoPattern', () => {
  it('lands on the same place in the pattern it started on', () => {
    // The shader must be handed a small number that sits at the same position between two lines as
    // the real coordinate did.
    const period = 100;
    for (const coordinate of [0, 37.5, -37.5, 1234.5, -98_765.25, 1e6 + 12.5]) {
      const folded = foldOntoPattern(coordinate, period);
      const before = ((coordinate % period) + period) % period;
      const after = ((folded % period) + period) % period;
      expect(after).toBeCloseTo(before, 9);
    }
  });

  it('never hands the shader more than half a period', () => {
    // A coordinate a kilometre out must arrive as tens of millimetres, or `fract` lacks the digits.
    for (const coordinate of [0.4, 940, -12_345.6, 8_000_000]) {
      expect(Math.abs(foldOntoPattern(coordinate, 100))).toBeLessThanOrEqual(50 + 1e-9);
    }
  });

  it('keeps the coarse lines sitting on the fine ones', () => {
    // The period is a multiple of every cell drawn, so folding cannot slide the decade lines off
    // the ones they are supposed to coincide with.
    const cell = 0.01;
    const folded = foldOntoPattern(54_321.987, cell * 100);
    for (const level of [cell, cell * 10, cell * 100]) {
      const before = ((54_321.987 % level) + level) % level;
      const after = ((folded % level) + level) % level;
      expect(after).toBeCloseTo(before, 9);
    }
  });

  it('refuses a period that would divide by zero rather than returning NaN', () => {
    // A NaN here does not throw, it silently erases the entire grid.
    expect(foldOntoPattern(10, 0)).toBe(0);
    expect(foldOntoPattern(Number.NaN, 100)).toBe(0);
    expect(foldOntoPattern(10, Number.NaN)).toBe(0);
  });
});

describe('gridReach', () => {
  it('grows with the viewing distance, so the grid keeps its apparent reach', () => {
    expect(gridReach(200)).toBeGreaterThan(gridReach(100));
    expect(gridReach(1000) / gridReach(100)).toBeCloseTo(10, 6);
  });

  it('stays positive at the origin', () => {
    // A reach of zero makes the fade `smoothstep(0, 0, …)`, which is undefined and takes the whole
    // grid with it.
    expect(gridReach(0)).toBeGreaterThan(0);
  });
});

describe('groundReach', () => {
  it('matches the plain reach when the eye is over the patch centre', () => {
    // A view straight down needs no extra floor; widening the quad there would waste fill rate.
    expect(groundReach(100, 0)).toBe(gridReach(100));
  });

  it('covers the ground under a grazing eye, not just around the target', () => {
    // Camera 2 mm from what it orbits but 5 m away across the floor: the reach must cover the
    // floor, not a 60 mm circle around the target.
    expect(groundReach(2, 5000)).toBe(gridReach(5000));
    expect(groundReach(2, 5000)).toBeGreaterThan(gridReach(2));
  });

  it('never shrinks below what the viewing distance alone asks for', () => {
    for (const [apparent, lateral] of [
      [1, 0],
      [10, 3],
      [1000, 12],
      [0.05, 0.001],
    ] as const) {
      expect(groundReach(apparent, lateral)).toBeGreaterThanOrEqual(gridReach(apparent));
    }
  });
});

describe('axisUnderPointer', () => {
  const origin = { x: 100, y: 100 };
  const tips = [
    { x: 200, y: 100 },
    { x: 100, y: 200 },
    { x: 100, y: 40 },
  ];

  it('finds the axis the pointer is on', () => {
    expect(axisUnderPointer(origin, tips, { x: 160, y: 101 }, 4)).toBe(0);
    expect(axisUnderPointer(origin, tips, { x: 101, y: 160 }, 4)).toBe(1);
  });

  it('ignores a pointer that is merely nearby', () => {
    // Tight, because an axis runs through the whole scene: a generous reach would light one up
    // whenever the pointer drifted near the origin.
    expect(axisUnderPointer(origin, tips, { x: 160, y: 120 }, 4)).toBeNull();
  });

  it('reads past the drawn tip, which is only a sample of the direction', () => {
    expect(axisUnderPointer(origin, tips, { x: 900, y: 100 }, 4)).toBe(0);
  });

  it('does not reach backwards through the origin', () => {
    // Behind the origin is the other half, the one being revealed, not the one reached for.
    expect(axisUnderPointer(origin, tips, { x: -700, y: 100 }, 4)).toBeNull();
  });

  it('skips an axis pointing at the camera, which projects to a dot', () => {
    // Without this, a degenerate axis is "near" every pointer position around the origin and wins
    // every test.
    expect(axisUnderPointer(origin, [{ x: 100, y: 100 }], { x: 100, y: 101 }, 4)).toBeNull();
  });

  it('has nothing to answer when the origin is off screen', () => {
    expect(axisUnderPointer(null, tips, { x: 160, y: 100 }, 4)).toBeNull();
  });

  it('tells apart two axes that project onto the same screen line', () => {
    // Y runs down the screen and Z up it: the same line, opposite ways. Testing an infinite line
    // cannot separate them and would hand every pointer on that line to whichever came first.
    expect(axisUnderPointer(origin, tips, { x: 100, y: 60 }, 4)).toBe(2);
    expect(axisUnderPointer(origin, tips, { x: 100, y: 160 }, 4)).toBe(1);
  });
});
