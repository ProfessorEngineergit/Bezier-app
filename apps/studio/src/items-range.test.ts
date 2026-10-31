import { describe, expect, it } from 'vitest';
import { rangeBetween } from './items-range.js';

const order = ['a', 'b', 'c', 'd'];

describe('rangeBetween', () => {
  it('runs from the anchor to the clicked row in list order', () => {
    expect(rangeBetween(order, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('works upwards too', () => {
    expect(rangeBetween(order, 'd', 'a')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is the row itself when anchor and row are the same', () => {
    expect(rangeBetween(order, 'c', 'c')).toEqual(['c']);
  });

  it('has nothing without an anchor or when a row is no longer listed', () => {
    expect(rangeBetween(order, null, 'c')).toBeNull();
    expect(rangeBetween(order, 'gone', 'c')).toBeNull();
  });
});
