import { describe, expect, it } from 'vitest';
import { Redraw } from './redraw.js';

const canvas = {} as Element;

describe('pacing frames that cost seconds', () => {
  it('draws at once while the frames are cheap', () => {
    const redraw = new Redraw(canvas);
    redraw.looped(0);
    expect(redraw.due(false, false, 0)).toBe(true);
    redraw.looped(16);
    redraw.invalidate();
    expect(redraw.due(false, false, 16)).toBe(true);
  });

  it('holds a change back for as long as the last frame took, so the page can answer between', () => {
    const redraw = new Redraw(canvas);
    redraw.looped(0);
    expect(redraw.due(false, false, 0)).toBe(true);
    // That frame held the thread for two seconds.
    redraw.looped(2000);
    redraw.invalidate();
    expect(redraw.due(false, false, 2000)).toBe(false);
    redraw.looped(3000);
    expect(redraw.due(false, false, 3000)).toBe(false);
    redraw.looped(3900);
    expect(redraw.due(false, false, 3900), 'two seconds after the thread was free').toBe(false);
    redraw.looped(4100);
    expect(redraw.due(false, false, 4100), 'drawn once the pause is over').toBe(true);
  });

  it('never holds back a turn of the view', () => {
    const redraw = new Redraw(canvas);
    redraw.looped(0);
    redraw.due(false, false, 0);
    redraw.looped(2000);
    expect(redraw.due(true, false, 2000)).toBe(true);
  });
});
