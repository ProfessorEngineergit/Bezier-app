import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchPixelDensity } from './pixel-density.js';

afterEach(() => vi.unstubAllGlobals());

/** A browser whose scale can be changed: each query matches one density, as `resolution` does. */
function display(start: number) {
  const queries: { media: string; listeners: Set<() => void> }[] = [];
  vi.stubGlobal('devicePixelRatio', start);
  vi.stubGlobal('matchMedia', (media: string) => {
    const query = { media, listeners: new Set<() => void>() };
    queries.push(query);
    return {
      addEventListener: (_: string, listener: () => void) => query.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => query.listeners.delete(listener),
    };
  });
  return {
    queries,
    scale: (ratio: number) => {
      const before = queries.filter((query) => query.listeners.size > 0);
      vi.stubGlobal('devicePixelRatio', ratio);
      for (const query of before) for (const listener of [...query.listeners]) listener();
    },
  };
}

describe('following the display density', () => {
  it('reports each change, asking again for the new density each time', () => {
    const screen = display(1);
    const seen: number[] = [];
    const stop = watchPixelDensity((ratio) => seen.push(ratio));
    screen.scale(2);
    screen.scale(1.5);
    expect(seen).toEqual([2, 1.5]);
    expect(screen.queries.map((query) => query.media)).toEqual([
      '(resolution: 1dppx)',
      '(resolution: 2dppx)',
      '(resolution: 1.5dppx)',
    ]);
    stop();
    screen.scale(1);
    expect(seen).toEqual([2, 1.5]);
  });
});
