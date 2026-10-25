import type { RailGroup } from '@bezier/ui';
import { describe, expect, it } from 'vitest';
import { allowedWhileBuilding, lockRail, ModelLock } from './model-lock.js';

describe('ModelLock', () => {
  it('refuses a second change while the first is running', () => {
    const lock = new ModelLock();
    const release = lock.tryHold();
    expect(release).not.toBeNull();
    expect(lock.tryHold()).toBeNull();
    release?.();
    expect(lock.tryHold()).not.toBeNull();
  });

  it('stays held until every hold is released', () => {
    const lock = new ModelLock();
    const reading = lock.hold();
    const building = lock.hold();
    reading();
    expect(lock.held).toBe(true);
    building();
    expect(lock.held).toBe(false);
  });

  it('releases once, however often the release is called', () => {
    const lock = new ModelLock();
    const first = lock.hold();
    const second = lock.hold();
    first();
    first();
    expect(lock.held).toBe(true);
    second();
    expect(lock.held).toBe(false);
  });

  it('tells listeners when it is taken and when it is free again, not on every hold', () => {
    const lock = new ModelLock();
    const seen: boolean[] = [];
    lock.subscribe((held) => seen.push(held));
    const a = lock.hold();
    const b = lock.hold();
    a();
    b();
    expect(seen).toEqual([true, false]);
  });
});

describe('lockRail', () => {
  it('refuses modelling commands, flyouts included, and leaves looking alone', () => {
    const groups: RailGroup[] = [
      {
        id: 'categories',
        items: [
          {
            id: 'solid',
            label: 'Solid',
            icon: null,
            flyout: [{ id: 'fillet', label: 'Fillet', icon: null }],
          },
          { id: 'measure', label: 'Measure', icon: null },
        ],
      },
    ];
    const [group] = lockRail(groups);
    const [solid, measure] = group?.items ?? [];
    expect(solid?.disabled).toBe(true);
    expect(solid?.flyout?.[0]?.disabled).toBe(true);
    expect(measure?.disabled).toBeUndefined();
    expect(allowedWhileBuilding('items')).toBe(true);
    expect(allowedWhileBuilding('extrude')).toBe(false);
  });
});

describe('waiting for the lock', () => {
  it('hands the lock to waiting holds in turn, without letting anything in between', async () => {
    const lock = new ModelLock();
    const first = lock.hold();
    const order: string[] = [];
    const a = lock.acquire().then((release) => {
      order.push('a');
      return release;
    });
    const b = lock.acquire().then((release) => {
      order.push('b');
      release();
    });
    first();
    expect(lock.tryHold()).toBeNull();
    (await a)();
    await b;
    expect(order).toEqual(['a', 'b']);
    expect(lock.held).toBe(false);
  });
});
