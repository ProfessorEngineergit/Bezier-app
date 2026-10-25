import { describe, expect, it } from 'vitest';
import { edgeRef, faceRef, formatRef } from '../stable-ref.js';
import { cacheKey, defineFeature, getFeature, listFeatures, readParams } from './index.js';
import { canonicalise } from './params.js';

describe('the registry', () => {
  it('knows the features that registered themselves', () => {
    const types = listFeatures().map((f) => f.type);
    expect(types).toContain('extrude');
    expect(types).toContain('fillet');
  });

  it('gives every feature a label, a schema, and declared face tags', () => {
    // The three things the rest of the app derives from a definition instead of hard-coding. A
    // feature missing any of them would break a panel without a sound.
    for (const feature of listFeatures()) {
      expect(feature.label).not.toBe('');
      expect(Object.keys(feature.params).length).toBeGreaterThan(0);
      // A sketch declares none: it contributes no faces.
      expect(Array.isArray(feature.faceTags)).toBe(true);
    }
  });

  it('still rejects duplicate feature types outside hot reload', () => {
    const definition = {
      type: 'duplicate-test',
      label: 'Duplicate test',
      params: { distance: { kind: 'length' as const, label: 'Distance', default: 1 } },
      faceTags: [],
      rebuild: async () => ({ ok: true as const, value: { body: null, evolution: null } }),
    };

    defineFeature(definition);
    expect(() => defineFeature(definition)).toThrow(/already registered/);
  });
});

describe('reading parameters from a saved document', () => {
  it('fills in defaults for parameters that are absent', () => {
    // This lets a new parameter be added without invalidating every document on disk.
    const result = readParams('extrude', { sketch: 'sketch-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.distance).toBe(10);
      expect(result.params.direction).toBe('forward');
    }
  });

  it('rejects a value of the wrong type with a readable message', () => {
    const result = readParams('extrude', { sketch: 'sketch-1', distance: 'ten' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Distance must be a number/);
  });

  it('enforces declared bounds', () => {
    const result = readParams('extrude', { sketch: 'sketch-1', distance: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at least/);
  });

  it('rejects a choice outside its options', () => {
    const result = readParams('extrude', { sketch: 'sketch-1', direction: 'sideways' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/forward, backward, symmetric/);
  });

  it('parses geometry references rather than trusting them', () => {
    const edge = edgeRef(faceRef('extrude-1', 'end'), faceRef('extrude-1', 'side-1'));
    const result = readParams('fillet', { edges: [formatRef(edge)], radius: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) expect((result.params.edges as unknown[]).length).toBe(1);
  });

  it('reports a malformed reference instead of throwing', () => {
    const result = readParams('fillet', { edges: ['not-a-reference'], radius: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/could not be read/);
  });

  it('says so plainly when a document uses a feature this build lacks', () => {
    // Forward compatibility: opening a newer file must explain itself, not fail.
    const result = readParams('wrap-emboss', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/does not know/);
  });
});

describe('cache keys', () => {
  const spec = getFeature('extrude')?.params ?? {};

  it('are stable across key order', () => {
    const a = canonicalise(spec, {
      sketch: 's1',
      distance: 10,
      direction: 'forward',
      operation: 'new',
    });
    const b = canonicalise(spec, {
      operation: 'new',
      direction: 'forward',
      distance: 10,
      sketch: 's1',
    });
    expect(a).toBe(b);
  });

  it('change when a parameter changes', () => {
    const a = cacheKey('extrude', { sketch: 's1', distance: 10 }, 'up');
    const b = cacheKey('extrude', { sketch: 's1', distance: 11 }, 'up');
    expect(a).not.toBe(b);
  });

  it('change when anything upstream changes', () => {
    // What makes a rebuild recompute everything downstream of an edit and leave the rest as
    // cache hits.
    const a = cacheKey('extrude', { sketch: 's1', distance: 10 }, 'upstream-a');
    const b = cacheKey('extrude', { sketch: 's1', distance: 10 }, 'upstream-b');
    expect(a).not.toBe(b);
  });

  it('ignore the order edges were picked in', () => {
    // Selecting two edges the other way round is the same selection and must not miss the cache.
    const filletSpec = getFeature('fillet')?.params ?? {};
    const one = faceRef('extrude-1', 'end');
    const two = faceRef('extrude-1', 'side-1');
    const three = faceRef('extrude-1', 'side-2');

    const a = canonicalise(filletSpec, {
      edges: [edgeRef(one, two), edgeRef(one, three)],
      radius: 2,
    });
    const b = canonicalise(filletSpec, {
      edges: [edgeRef(one, three), edgeRef(one, two)],
      radius: 2,
    });
    expect(a).toBe(b);
  });

  it('do not confuse floating-point noise for a change', () => {
    const a = canonicalise(spec, { distance: 3 });
    const b = canonicalise(spec, { distance: 3.0000000001 });
    expect(a).toBe(b);
  });
});
