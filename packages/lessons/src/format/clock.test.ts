import { describe, expect, it } from 'vitest';
import { clock, clockFine, count, dateWords, lengthWords } from './clock.js';

describe('the clock', () => {
  it('reads minutes and seconds, and hours only past an hour', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(75.9)).toBe('1:15');
    expect(clock(3725)).toBe('1:02:05');
  });

  it('never shows a broken number', () => {
    expect(clock(-3)).toBe('0:00');
    expect(clock(Number.NaN)).toBe('0:00');
    expect(clock(Number.POSITIVE_INFINITY)).toBe('0:00');
  });

  it('says a length in words', () => {
    expect(lengthWords(0.7875)).toBe('1 s');
    expect(lengthWords(44)).toBe('44 s');
    expect(lengthWords(150)).toBe('3 min');
    expect(lengthWords(4800)).toBe('1 h 20 min');
    expect(lengthWords(7200)).toBe('2 h');
  });

  it('reads a date, and leaves alone what is not one', () => {
    expect(dateWords('2026-09-28T20:05:25.808Z')).toBe('28 Sept 2026');
    expect(dateWords('yesterday')).toBe('yesterday');
  });

  it('counts with the right plural', () => {
    expect(count(1, 'chapter')).toBe('1 chapter');
    expect(count(3, 'chapter')).toBe('3 chapters');
  });
});

describe('the fine clock', () => {
  it('shows tenths and rounds to them', () => {
    expect(clockFine(1.5)).toBe('0:01.5');
    expect(clockFine(59.96)).toBe('1:00.0');
    expect(clockFine(-2)).toBe('0:00.0');
  });
});
