import { expect, it } from 'vitest';
import { typedNumber } from './typed-number.js';

it('reads units, arithmetic and a decimal comma the way a person meant them (audit F-031)', () => {
  expect(typedNumber('2in')).toBeCloseTo(50.8);
  expect(typedNumber('10*2+3')).toBe(23);
  expect(typedNumber('1,5')).toBe(1.5);
  expect(typedNumber('1.5')).toBe(1.5);
  expect(typedNumber('-4')).toBe(-4);
  expect(typedNumber('5 cm')).toBe(50);
  // Inside a function the comma separates arguments.
  expect(typedNumber('max(2, 7)')).toBe(7);
});

it('refuses what is not a number instead of guessing', () => {
  expect(typedNumber('')).toBeNull();
  expect(typedNumber('abc')).toBeNull();
  expect(typedNumber('2 +')).toBeNull();
});
