import { describe, expect, it } from 'vitest';
import { type Guide, type GuideEnv, GuideRunner } from './guide.js';

/** A page that has exactly these things on it. */
function page(
  ...present: string[]
): GuideEnv & { add(name: string): void; remove(name: string): void } {
  const here = new Set(present);
  return {
    resolve: (target) => {
      const name = typeof target === 'string' ? target : target.selector;
      return here.has(name) ? ({ contains: () => true } as unknown as Element) : null;
    },
    add: (name) => here.add(name),
    remove: (name) => here.delete(name),
  };
}

const guide: Guide = {
  id: 'test',
  title: 'Test',
  steps: [
    {
      say: 'one',
      choices: [
        { label: 'Go', go: 'next' },
        { label: 'No', go: 'skip' },
      ],
    },
    {
      say: 'two',
      wait: { edit: { op: 'addFeature', type: ['extrude', 'sketch'] } },
      hint: { after: 8, say: 'two again' },
    },
    { say: 'three', wait: { present: '.bar' } },
    { say: 'four', wait: { gone: '.bar' } },
    { say: 'five', wait: { delay: 2 } },
    { say: 'six' },
  ],
};

describe('a guide', () => {
  it('starts at the first step', () => {
    const runner = new GuideRunner(guide, page());
    expect(runner.start(0)).toMatchObject({ kind: 'step', index: 0 });
  });

  it('moves on when a button says next, and ends when it says skip', () => {
    const runner = new GuideRunner(guide, page());
    runner.start(0);
    expect(runner.choose('next', 1)).toMatchObject({ kind: 'step', index: 1 });
    expect(new GuideRunner(guide, page()).choose('skip', 1)).toEqual({
      kind: 'done',
      skipped: true,
    });
    expect(new GuideRunner(guide, page()).choose('close', 1)).toEqual({ kind: 'closed' });
  });

  it('waits for the right edit and ignores the others', () => {
    const runner = new GuideRunner(guide, page());
    runner.start(0);
    runner.choose('next', 1);
    expect(runner.notify({ kind: 'edit', op: 'renameDocument' }, 2)).toBeNull();
    expect(runner.notify({ kind: 'edit', op: 'addFeature', type: 'fillet' }, 2)).toBeNull();
    expect(runner.notify({ kind: 'edit', op: 'addFeature' }, 2)).toBeNull();
    expect(runner.notify({ kind: 'edit', op: 'addFeature', type: 'extrude' }, 3)).toMatchObject({
      kind: 'step',
      index: 2,
    });
  });

  it('gives a hint once, after a while, and not before', () => {
    const runner = new GuideRunner(guide, page());
    runner.start(0);
    runner.choose('next', 10);
    expect(runner.poll(15)).toBeNull();
    expect(runner.poll(18)).toEqual({ kind: 'hint', say: 'two again' });
    expect(runner.poll(40)).toBeNull();
  });

  it('notices something appearing and something going', () => {
    const env = page();
    const runner = new GuideRunner(guide, env);
    runner.start(0);
    runner.choose('next', 0);
    runner.notify({ kind: 'edit', op: 'addFeature', type: 'sketch' }, 1);
    expect(runner.step?.say).toBe('three');
    expect(runner.poll(2)).toBeNull();
    env.add('.bar');
    expect(runner.poll(3)).toMatchObject({ kind: 'step', index: 3 });
    expect(runner.poll(4)).toBeNull();
    env.remove('.bar');
    expect(runner.poll(5)).toMatchObject({ kind: 'step', index: 4 });
  });

  it('waits a number of seconds', () => {
    const runner = new GuideRunner(
      { ...guide, steps: [{ say: 'x', wait: { delay: 2 } }, { say: 'y' }] },
      page(),
    );
    runner.start(10);
    expect(runner.poll(11)).toBeNull();
    expect(runner.poll(12.1)).toMatchObject({ kind: 'step', index: 1 });
  });

  it('is done after the last step and does not run on', () => {
    const runner = new GuideRunner({ ...guide, steps: [{ say: 'only' }] }, page());
    runner.start(0);
    expect(runner.next(1)).toEqual({ kind: 'done', skipped: false });
    expect(runner.step).toBeNull();
    expect(runner.poll(99)).toBeNull();
  });

  it('does not treat an unrelated click as the click it waits for', () => {
    const env: GuideEnv = { resolve: () => null };
    const runner = new GuideRunner(
      { ...guide, steps: [{ say: 'x', wait: { click: '.gone' } }, { say: 'y' }] },
      env,
    );
    runner.start(0);
    expect(runner.notify({ kind: 'click', target: null }, 1)).toBeNull();
  });
});
