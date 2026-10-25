import { describe, expect, it } from 'vitest';
import { describeTask, formatPercent, formatRate, formatRemaining } from './task-progress.js';

describe('formatRate', () => {
  it('climbs units rather than printing four-digit kilobytes', () => {
    expect(formatRate(512)).toBe('512 B/s');
    expect(formatRate(2048)).toBe('2.0 KB/s');
    expect(formatRate(5 * 1024 * 1024)).toBe('5.0 MB/s');
  });

  it('drops the decimal above 100, where it is only noise', () => {
    // 98.4 MB/s and 984 MB/s tell a reader watching a bar move the same thing; the extra digit only
    // flickers.
    expect(formatRate(500 * 1024 * 1024)).toBe('500 MB/s');
  });

  it('says nothing rather than something wrong', () => {
    expect(formatRate(Number.NaN)).toBe('');
    expect(formatRate(-1)).toBe('');
  });
});

describe('formatRemaining', () => {
  it('reads as time, not as seconds', () => {
    expect(formatRemaining(1000, 100)).toBe('10s left');
    expect(formatRemaining(90_000, 1000)).toBe('1m 30s left');
    expect(formatRemaining(7_200_000, 1000)).toBe('2h 0m left');
  });

  it('refuses to divide by a stalled rate', () => {
    // A stalled transfer must not report "Infinity left".
    expect(formatRemaining(1000, 0)).toBe('');
    expect(formatRemaining(1000, -5)).toBe('');
  });

  it('does not round a nearly-finished task down to zero', () => {
    expect(formatRemaining(10, 1000)).toBe('almost done');
  });
});

describe('describeTask', () => {
  it('joins only the parts that exist, with no stray separator', () => {
    expect(
      describeTask({
        id: 'a',
        label: 'Exporting',
        progress: 0.42,
        bytesPerSecond: 2048,
        bytesRemaining: 4096,
      }),
    ).toBe('42,00% · 2.0 KB/s · 2s left');
  });

  it('says nothing at all for a task that cannot report anything', () => {
    // Kernel work that has no measurable progress. The strip shows motion; a made-up percentage
    // would be a lie the user acts on.
    expect(describeTask({ id: 'b', label: 'Rebuilding' })).toBe('');
  });

  it('clamps a progress value that overshoots', () => {
    expect(describeTask({ id: 'c', label: 'Importing', progress: 1.4 })).toBe('100,00%');
  });

  it('shows the hundredths with a decimal comma, and the phase first', () => {
    expect(formatPercent(0.42173)).toBe('42,17%');
    expect(formatPercent(0)).toBe('0,00%');
    expect(describeTask({ id: 'd', label: 'Importing', progress: 0.5, phase: 'Reading' })).toBe(
      'Reading · 50,00%',
    );
  });
});
