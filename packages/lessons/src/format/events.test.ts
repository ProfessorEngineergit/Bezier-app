import { describe, expect, it } from 'vitest';
import { clickAt, keyLabel, keysAt, pointerAt, shortcutsUsed, sortedEvents } from './events.js';
import type { LessonEvent } from './manifest.js';

const key = (time: number, k: string, modifiers: string[] = []): LessonEvent => ({
  kind: 'key',
  time,
  code: k,
  key: k,
  modifiers,
});

const events: LessonEvent[] = sortedEvents([
  { kind: 'pointer', time: 1, x: 0.1, y: 0.1 },
  key(2, 'e'),
  key(2.4, 'Shift'),
  key(2.5, 'z', ['meta']),
  { kind: 'click', time: 3, x: 0.5, y: 0.5, button: 0 },
  { kind: 'pointer', time: 3.2, x: 0.6, y: 0.6 },
  { kind: 'edit', time: 3.3, title: 'Extrude', operation: null },
  key(9, 'e'),
]);

describe('keys on screen', () => {
  it('show the keys just pressed, oldest first, without lone modifiers', () => {
    expect(keysAt(events, 2.6).map((k) => k.key)).toEqual(['e', 'z']);
    expect(keysAt(events, 3.4).map((k) => k.key)).toEqual(['z']);
    expect(keysAt(events, 5)).toEqual([]);
  });

  it('are named the way the learner’s keyboard names them', () => {
    expect(keyLabel({ key: 'z', modifiers: ['meta', 'shift'] }, true)).toBe('⌘ ⇧ Z');
    expect(keyLabel({ key: 'z', modifiers: ['ctrl'] }, false)).toBe('Ctrl + Z');
    expect(keyLabel({ key: ' ', modifiers: [] }, true)).toBe('Space');
    expect(keyLabel({ key: 'ArrowLeft', modifiers: [] }, true)).toBe('←');
    expect(keyLabel({ key: 'F2', modifiers: [] }, true)).toBe('F2');
  });
});

describe('clicks and the pointer', () => {
  it('ripple a click briefly', () => {
    expect(clickAt(events, 3.1)?.x).toBe(0.5);
    expect(clickAt(events, 3.7)).toBeUndefined();
    expect(clickAt(events, 2.9)).toBeUndefined();
  });

  it('follow the pointer and fade when it stops', () => {
    expect(pointerAt(events, 1.5)).toEqual({ x: 0.1, y: 0.1 });
    expect(pointerAt(events, 4)).toEqual({ x: 0.6, y: 0.6 });
    expect(pointerAt(events, 6)).toBeUndefined();
    expect(pointerAt(events, 0.5)).toBeUndefined();
  });

  it('glide between two samples close in time, and jump between far ones', () => {
    const between = pointerAt(events, 3.1);
    expect(between?.x).toBeCloseTo(0.55);
    expect(between?.y).toBeCloseTo(0.55);
    expect(pointerAt(events, 3)).toEqual({ x: 0.5, y: 0.5 });
    // Samples 1.5 s apart are a jump, so nothing is interpolated.
    expect(pointerAt(events, 2)).toEqual({ x: 0.1, y: 0.1 });
  });
});

describe('the shortcuts a lesson uses', () => {
  it('are counted, most used first', () => {
    expect(shortcutsUsed(events, true)).toEqual([
      { label: 'E', count: 2 },
      { label: '⌘ Z', count: 1 },
    ]);
  });
});

describe('sorting', () => {
  it('keeps the order of events at the same moment', () => {
    const sorted = sortedEvents([key(1, 'b'), key(0, 'a'), key(1, 'c')]);
    expect(sorted.map((e) => (e.kind === 'key' ? e.key : ''))).toEqual(['a', 'b', 'c']);
  });
});
