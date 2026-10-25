import { describe, expect, it } from 'vitest';
import { createHistory, GESTURE_GAP } from './history.js';

describe('what the author can undo', () => {
  it('steps back and forward through separate changes', () => {
    const h = createHistory('a');
    h.push('b', undefined, 0);
    h.push('c', undefined, 10);
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBe('a');
    expect(h.redo()).toBe('b');
    expect(h.redo()).toBe('c');
    expect(h.canRedo).toBe(false);
  });

  it('counts a drag as one step, however many changes it made', () => {
    const h = createHistory(0);
    for (let i = 1; i <= 40; i += 1) h.push(i, 'trim:0:end', i * 16);
    expect(h.current).toBe(40);
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  it('starts a new step when the gesture pauses, changes, or another begins', () => {
    const h = createHistory(0);
    h.push(1, 'name', 0);
    h.push(2, 'name', 100);
    h.push(3, 'name', 100 + GESTURE_GAP + 1);
    h.push(4, 'other', 100 + GESTURE_GAP + 10);
    expect(h.undo()).toBe(3);
    expect(h.undo()).toBe(2);
    expect(h.undo()).toBe(0);
  });

  it('forgets what could be redone once something new is done', () => {
    const h = createHistory('a');
    h.push('b', undefined, 0);
    h.undo();
    h.push('c', undefined, 10);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe('a');
  });
});
