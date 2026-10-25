import { describe, expect, it } from 'vitest';
import { type Actor, NibController } from './controller.js';
import type { Guide } from './guide.js';
import type { ReactionName } from './reaction-data.js';
import type { Target } from './target.js';

/** A stand-in for an element: a size and whether it is on the page. */
function thing(width = 100, height = 100, connected = true, left = 0, top = 0): Element {
  return {
    isConnected: connected,
    getBoundingClientRect: () => ({
      width,
      height,
      left,
      top,
      right: left + width,
      bottom: top + height,
    }),
    contains: () => true,
  } as unknown as Element;
}

function actor(): Actor & { played: ReactionName[]; pointed: number[][]; stopped: number } {
  const log = {
    played: [] as ReactionName[],
    pointed: [] as number[][],
    stopped: 0,
  };
  return {
    ...log,
    play: (name) => void log.played.push(name),
    point: (dx, dy, until) => void log.pointed.push([dx, dy, until]),
    stopPointing: () => void log.stopped++,
    box: () => ({ left: 0, top: 500, width: 100, height: 160 }) as DOMRect,
    get played() {
      return log.played;
    },
    get pointed() {
      return log.pointed;
    },
    get stopped() {
      return log.stopped;
    },
  };
}

function page(found: Record<string, Element>) {
  return (target: Target) => found[typeof target === 'string' ? target : target.selector] ?? null;
}

const guide: Guide = {
  id: 'g',
  title: 'G',
  steps: [
    {
      say: 'hello',
      choices: [
        { label: 'Go', go: 'next' },
        { label: 'Later', go: 'close' },
      ],
    },
    {
      say: 'press the thing',
      at: '.thing',
      wait: { click: '.thing' },
      hint: { after: 5, say: 'it is the round one' },
      arrive: 'nod',
    },
    { say: 'all done', done: 'juhu' },
  ],
};

describe('where he stands', () => {
  it('is nowhere when nothing wants him', () => {
    expect(new NibController().placement()).toBeNull();
  });

  it('stands on the spot with the highest priority, the latest winning a tie', () => {
    const c = new NibController();
    const a = thing();
    const b = thing();
    const high = thing();
    c.registerSpot(a, { priority: 0 });
    c.registerSpot(b, { priority: 0 });
    expect(c.placement()).toMatchObject({ kind: 'spot', element: b });
    const take = c.registerSpot(high, { priority: 5, width: 200 });
    expect(c.placement()).toMatchObject({ kind: 'spot', element: high, width: 200 });
    take();
    expect(c.placement()).toMatchObject({ element: b });
  });

  it('ignores a spot that is not on the page or has no size', () => {
    const c = new NibController();
    c.registerSpot(thing(100, 100, false));
    c.registerSpot(thing(0, 100));
    expect(c.placement()).toBeNull();
  });

  it('goes to the corner for a guide, for something to say, or when a view asks, and no longer', () => {
    const c = new NibController({ find: page({}) });
    c.dock('lesson', true);
    expect(c.placement()).toMatchObject({ kind: 'dock' });
    c.dock('lesson', false);
    expect(c.placement()).toBeNull();
    c.say('hi', { seconds: 3, now: 0 });
    expect(c.placement()).toMatchObject({ kind: 'dock' });
    c.tick(4);
    expect(c.placement()).toBeNull();
    c.startGuide(guide, 0);
    expect(c.placement()).toMatchObject({ kind: 'dock' });
    c.stopGuide();
    expect(c.placement()).toBeNull();
  });

  it('prefers a spot to the corner', () => {
    const c = new NibController();
    c.dock('x', true);
    const spot = thing();
    c.registerSpot(spot);
    expect(c.placement()).toMatchObject({ kind: 'spot', element: spot });
  });
});

describe('what he says', () => {
  it('says a thing, with buttons, and takes it back', () => {
    const c = new NibController();
    let pressed = 0;
    c.say('hello', { options: [{ label: 'Hi', run: () => pressed++ }] });
    expect(c.getSnapshot().bubble?.text).toBe('hello');
    c.getSnapshot().bubble?.options[0]?.run();
    expect(pressed).toBe(1);
    c.hush();
    expect(c.getSnapshot().bubble).toBeNull();
  });

  it('tells its listeners, and a new bubble has a new key', () => {
    const c = new NibController();
    let heard = 0;
    const stop = c.subscribe(() => heard++);
    c.say('one');
    const first = c.getSnapshot().bubble?.key;
    c.say('two');
    expect(heard).toBe(2);
    expect(c.getSnapshot().bubble?.key).not.toBe(first);
    stop();
    c.say('three');
    expect(heard).toBe(2);
  });
});

describe('a guide', () => {
  it('points without a ring where the step says so', () => {
    const c = new NibController({ find: page({ '.big': thing(900, 600) }), clock: () => 0 });
    const nib = actor();
    c.attach(nib);
    c.startGuide({ id: 'r', title: 'R', steps: [{ say: 'look', at: '.big', ring: false }] }, 0);
    c.tick(1);
    expect(c.getSnapshot().aim).toBeNull();
    expect(nib.pointed.length).toBe(1);
  });

  it('walks its steps, points at the target, and remembers it is finished', () => {
    const thingOnPage = thing(40, 20, true, 300, 100);
    const storage = new Map<string, string>();
    const c = new NibController({
      find: page({ '.thing': thingOnPage }),
      storage: {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => void storage.set(k, v),
      },
      clock: () => 10,
    });
    const nib = actor();
    c.attach(nib);
    expect(c.isNew('g')).toBe(true);

    c.startGuide(guide, 0);
    expect(c.getSnapshot().bubble?.text).toBe('hello');
    expect(c.getSnapshot().guide).toMatchObject({ step: 0, steps: 3 });
    c.getSnapshot().bubble?.options[0]?.run();
    expect(c.getSnapshot().bubble?.text).toBe('press the thing');
    expect(nib.played).toContain('nod');
    expect(c.getSnapshot().aim).toBe('.thing');

    c.tick(11);
    expect(nib.pointed.length).toBe(1);
    expect(nib.pointed[0]?.[0]).toBeGreaterThan(0);

    c.notify({ kind: 'click', target: { nodeType: 1 } as unknown as EventTarget }, 12);
    expect(c.getSnapshot().bubble?.text).toBe('all done');
    expect(c.getSnapshot().aim).toBeNull();
    c.getSnapshot().bubble?.options[0]?.run();
    expect(c.guiding).toBe(false);
    expect(nib.played).toContain('juhu');
    expect(c.isNew('g')).toBe(false);
    expect(storage.get('bezier.nib')).toContain('"g"');
  });

  it('gives a hint when a step takes long', () => {
    const c = new NibController({ find: page({ '.thing': thing() }), clock: () => 0 });
    c.attach(actor());
    c.startGuide(guide, 0);
    c.getSnapshot().bubble?.options[0]?.run();
    c.tick(1);
    expect(c.getSnapshot().bubble?.text).toBe('press the thing');
    c.tick(7);
    expect(c.getSnapshot().bubble?.text).toBe('it is the round one');
  });

  it('can be put off without being counted as done', () => {
    const c = new NibController({ find: page({}), clock: () => 0 });
    c.startGuide(guide, 0);
    c.getSnapshot().bubble?.options[1]?.run();
    expect(c.guiding).toBe(false);
    expect(c.isNew('g')).toBe(true);
  });

  it('always offers a way out of a step that waits', () => {
    const c = new NibController({ find: page({ '.thing': thing() }), clock: () => 0 });
    c.startGuide(guide, 0);
    c.getSnapshot().bubble?.options[0]?.run();
    const options = c.getSnapshot().bubble?.options ?? [];
    expect(options.map((o) => o.label)).toEqual(['Skip this step']);
    options[0]?.run();
    expect(c.getSnapshot().bubble?.text).toBe('all done');
  });

  it('does nothing about events when no guide runs', () => {
    const c = new NibController();
    expect(() => c.notify({ kind: 'edit', op: 'addFeature', type: 'extrude' }, 0)).not.toThrow();
  });
});

describe('with the title bar', () => {
  it('no longer goes to the corner: the island says it, and a spot still wins', () => {
    const c = new NibController({ find: page({}) });
    c.setIsland(true);
    c.startGuide(guide, 0);
    expect(c.placement()).toBeNull();
    const spot = thing();
    c.registerSpot(spot);
    expect(c.placement()).toMatchObject({ kind: 'spot', element: spot });
  });

  it('tells a step that dragged on, and counts a guide finished but not one skipped', () => {
    const target = thing();
    const c = new NibController({ find: page({ '.thing': target }), clock: () => 0 });
    c.setIsland(true);
    c.startGuide(guide, 0);
    c.getSnapshot().bubble?.options[0]?.run();
    expect(c.getSnapshot().guide).toMatchObject({ step: 1, steps: 3, hinted: false });
    c.tick(6);
    expect(c.getSnapshot().guide?.hinted).toBe(true);
    c.notify({ kind: 'click', target: { nodeType: 1 } as unknown as EventTarget }, 7);
    c.getSnapshot().bubble?.options[0]?.run();
    expect(c.guiding).toBe(false);
    expect(c.getSnapshot().finished).toBe(1);
    c.startGuide(guide, 10);
    c.getSnapshot().bubble?.options[1]?.run();
    expect(c.getSnapshot().finished).toBe(1);
  });
});
