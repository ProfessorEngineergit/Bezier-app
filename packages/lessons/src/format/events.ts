/**
 * Keys, clicks and pointer position at a given lesson time. Expects events sorted with
 * `sortedEvents`, so each lookup is a binary search plus a short walk.
 */

import type { LessonEvent } from './manifest.js';

export type KeyEvent = Extract<LessonEvent, { kind: 'key' }>;
export type ClickEvent = Extract<LessonEvent, { kind: 'click' }>;
export type PointerEvent = Extract<LessonEvent, { kind: 'pointer' }>;

/** Seconds a key stays on screen. */
export const KEY_SHOWN = 1.3;
export const CLICK_SHOWN = 0.65;
/** Seconds without pointer movement after which the pointer ring fades. */
export const POINTER_SHOWN = 1.5;

/** A stably sorted copy. The recorder writes events in order; imported lessons may not. */
export function sortedEvents(events: readonly LessonEvent[]): LessonEvent[] {
  return events
    .map((event, order) => ({ event, order }))
    .sort((a, b) => a.event.time - b.event.time || a.order - b.order)
    .map(({ event }) => event);
}

/** Index of the last event at or before `time`, or -1. */
function lastIndexAtOrBefore(events: readonly LessonEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((events[mid]?.time ?? Number.POSITIVE_INFINITY) <= time) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

/** Modifier keys pressed on their own are not shown. */
const MODIFIER_ONLY = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS']);

/** The keys pressed within the last `KEY_SHOWN` seconds, oldest first, at most six. */
export function keysAt(events: readonly LessonEvent[], time: number): KeyEvent[] {
  const keys: KeyEvent[] = [];
  for (let i = lastIndexAtOrBefore(events, time); i >= 0; i -= 1) {
    const event = events[i];
    if (event === undefined || event.time <= time - KEY_SHOWN) break;
    if (event.kind === 'key' && !MODIFIER_ONLY.has(event.key)) keys.unshift(event);
    if (keys.length === 6) break;
  }
  return keys;
}

/** The click whose ripple is still showing at `time`, if any. */
export function clickAt(events: readonly LessonEvent[], time: number): ClickEvent | undefined {
  for (let i = lastIndexAtOrBefore(events, time); i >= 0; i -= 1) {
    const event = events[i];
    if (event === undefined || event.time <= time - CLICK_SHOWN) return undefined;
    if (event.kind === 'click') return event;
  }
  return undefined;
}

type Placed = Extract<LessonEvent, { x: number }>;

/** Pointer samples further apart than this (seconds) are a jump and are not interpolated. */
const POINTER_GAP = 0.4;

/**
 * The author's pointer position, or undefined after `POINTER_SHOWN` without movement. The recorder
 * samples at 25 Hz; positions are interpolated between samples so the pointer moves smoothly at
 * the frame rate.
 */
export function pointerAt(
  events: readonly LessonEvent[],
  time: number,
): { x: number; y: number } | undefined {
  const at = lastIndexAtOrBefore(events, time);
  let before: Placed | undefined;
  for (let i = at; i >= 0; i -= 1) {
    const event = events[i];
    if (event === undefined || event.time <= time - POINTER_SHOWN) break;
    if (event.kind === 'pointer' || event.kind === 'click') {
      before = event;
      break;
    }
  }
  if (before === undefined) return undefined;
  for (let i = at + 1; i < events.length; i += 1) {
    const event = events[i];
    if (event === undefined || event.time > before.time + POINTER_GAP) break;
    if (event.kind !== 'pointer' && event.kind !== 'click') continue;
    const span = event.time - before.time;
    if (span <= 0) return { x: event.x, y: event.y };
    const f = (time - before.time) / span;
    return { x: before.x + (event.x - before.x) * f, y: before.y + (event.y - before.y) * f };
  }
  return { x: before.x, y: before.y };
}

const MAC_MODIFIERS: Record<string, string> = { meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' };
const OTHER_MODIFIERS: Record<string, string> = {
  meta: 'Win',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
};
const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: '⌫',
  Delete: '⌦',
  Enter: '↩',
  Tab: '⇥',
};

/** "⌘ Z" on a Mac, "Ctrl + Z" elsewhere. */
export function keyLabel(event: Pick<KeyEvent, 'key' | 'modifiers'>, mac: boolean): string {
  const names = mac ? MAC_MODIFIERS : OTHER_MODIFIERS;
  const modifiers = event.modifiers.map((modifier) => names[modifier] ?? modifier);
  const name =
    KEY_NAMES[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return [...modifiers, name].join(mac ? ' ' : ' + ');
}

/** The shortcuts a lesson uses, most used first. */
export function shortcutsUsed(
  events: readonly LessonEvent[],
  mac: boolean,
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'key' || MODIFIER_ONLY.has(event.key)) continue;
    const label = keyLabel(event, mac);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
