import { describe, expect, it } from 'vitest';
import { formatChapters, formatDuration, formatSize } from './format.js';

describe('card numbers', () => {
  it('reads durations as minutes and seconds', () => {
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(65)).toBe('1:05 min');
    expect(formatDuration(1800)).toBe('30:00 min');
  });

  it('reads sizes in KB and MB', () => {
    expect(formatSize(86_101)).toBe('86 KB');
    expect(formatSize(4_200_000)).toBe('4.2 MB');
    expect(formatSize(256_000_000)).toBe('256 MB');
  });

  it('counts chapters', () => {
    expect(formatChapters(1)).toBe('1 chapter');
    expect(formatChapters(4)).toBe('4 chapters');
  });
});
