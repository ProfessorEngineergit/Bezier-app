import { describe, expect, it } from 'vitest';
import './index.js';
import { getFeature, readParams } from './registry.js';

describe('the image feature', () => {
  const feature = getFeature('reference-image');

  it('is registered and brings no faces of its own', () => {
    expect(feature?.faceTags).toEqual([]);
  });

  it('lets the solid through untouched, and builds nothing', async () => {
    const body = 'shape-1' as never;
    const read = readParams('reference-image', { image: 'abc', mime: 'image/png' });
    if (!read.ok) throw new Error(read.message);
    const result = await feature?.rebuild({} as never, read.params as never, { body } as never);
    expect(result).toEqual({ ok: true, value: { body, evolution: null } });
  });

  it('accepts what an import writes: every crop none, and rejects a crop below zero', () => {
    const written = {
      image: 'abc',
      mime: 'image/png',
      pixelWidth: 200,
      pixelHeight: 100,
      plane: 'XY',
      offset: 0,
      opacity: 0.8,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 0,
      cropLeft: 0,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
    };
    expect(readParams('reference-image', written).ok).toBe(true);
    expect(readParams('reference-image', { ...written, cropLeft: -0.1 }).ok).toBe(false);
    expect(readParams('reference-image', { ...written, cropLeft: 0.99 }).ok).toBe(false);
  });

  it('reads a document that has only the picture, with every placement at its default', () => {
    const read = readParams('reference-image', { image: 'abc', mime: 'image/png' });
    if (!read.ok) throw new Error(read.message);
    expect(read.params).toMatchObject({
      plane: 'XY',
      offset: 0,
      x: 0,
      y: 0,
      width: 100,
      rotation: 0,
      cropLeft: 0,
      cropBottom: 0,
    });
  });
});
