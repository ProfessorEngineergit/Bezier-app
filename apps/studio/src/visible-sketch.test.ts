import {
  type CadDocument,
  createEmptyDocument,
  type FeatureRecord,
  type FeatureStatus,
  planeBasis,
  type SketchRegion,
} from '@bezier/core';
import { describe, expect, it } from 'vitest';
import { shownSketches, usedAreas } from './visible-sketch.js';

const XY = planeBasis('XY');

function sketch(id: string): FeatureRecord {
  return {
    id,
    type: 'sketch',
    name: 'Sketch',
    params: { plane: 'XY', sketch: { primitives: [], constraints: [] } },
  };
}

function extrude(id: string, source: string, regions?: readonly string[]): FeatureRecord {
  return {
    id,
    type: 'extrude',
    name: 'Extrude',
    params: { sketch: source, distance: 15, ...(regions === undefined ? {} : { regions }) },
  };
}

const area = (key: string) => ({ key }) as SketchRegion;

function viewOf(
  features: readonly FeatureRecord[],
  statuses: Record<string, FeatureStatus['state']>,
  areas: Record<string, readonly string[]>,
) {
  const document: CadDocument = { ...createEmptyDocument('Sketches'), features };
  const view = {
    statuses: new Map(
      Object.entries(statuses).map(([id, state]) => [id, { state }] as [string, FeatureStatus]),
    ),
    sketches: new Map(
      Object.entries(areas).map(([id, keys]) => [
        id,
        { basis: XY ?? { origin: { x: 0, y: 0, z: 0 } }, regions: keys.map(area) },
      ]),
    ),
  } as Parameters<typeof shownSketches>[1];
  return { document, view };
}

describe('which sketches stay on show', () => {
  it('shows every sketch nothing has built from, not only the newest', () => {
    const { document, view } = viewOf(
      [sketch('s1'), sketch('s2')],
      { s1: 'ok', s2: 'ok' },
      { s1: ['a'], s2: ['b'] },
    );
    expect(shownSketches(document, view, null).map((item) => item.id)).toEqual(['s1', 's2']);
  });

  it('keeps a sketch on show when its extrude failed', () => {
    const { document, view } = viewOf(
      [sketch('s1'), extrude('e1', 's1')],
      { s1: 'ok', e1: 'failed' },
      { s1: ['a'] },
    );
    expect(shownSketches(document, view, null).map((item) => item.id)).toEqual(['s1']);
  });

  it('hides a sketch once all of its areas are used', () => {
    const { document, view } = viewOf(
      [sketch('s1'), extrude('e1', 's1', ['a']), extrude('e2', 's1', ['b'])],
      { s1: 'ok', e1: 'ok', e2: 'ok' },
      { s1: ['a', 'b'] },
    );
    expect(shownSketches(document, view, null)).toEqual([]);
  });

  it('keeps a sketch with an unused area on show, and says which are used', () => {
    const { document, view } = viewOf(
      [sketch('s1'), extrude('e1', 's1', ['a'])],
      { s1: 'ok', e1: 'ok' },
      { s1: ['a', 'b'] },
    );
    const [shown] = shownSketches(document, view, null);
    expect(shown?.id).toBe('s1');
    expect([...(shown?.used ?? [])]).toEqual(['a']);
  });

  it('treats an extrude that names no areas as using all of them', () => {
    const { document, view } = viewOf(
      [sketch('s1'), extrude('e1', 's1')],
      { s1: 'ok', e1: 'ok' },
      { s1: ['a', 'b'] },
    );
    expect(usedAreas(document.features, view.statuses, 's1')).toBe('all');
    expect(shownSketches(document, view, null)).toEqual([]);
  });

  it('leaves out the sketch being edited, which is drawn as the draft instead', () => {
    const { document, view } = viewOf(
      [sketch('s1'), sketch('s2')],
      { s1: 'ok', s2: 'ok' },
      { s1: ['a'], s2: ['b'] },
    );
    expect(shownSketches(document, view, 's1').map((item) => item.id)).toEqual(['s2']);
  });
});
