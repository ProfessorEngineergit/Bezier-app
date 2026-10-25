/**
 * The behaviour that matters: a backlog of rapid requests collapses to one extra round trip and
 * does not replay every value in between.
 */
import { describe, expect, it } from 'vitest';
import { coalescePreview } from './coalesce-preview.js';

/** A promise this test can resolve on its own schedule, to control ordering. */
function defer<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('coalescePreview', () => {
  it('sends a single request and applies its result', async () => {
    const applied: number[] = [];
    const { request } = coalescePreview(
      (value: number) => Promise.resolve(value * 2),
      (result) => applied.push(result),
    );
    request(5);
    await Promise.resolve();
    await Promise.resolve();
    expect(applied).toEqual([10]);
  });

  it('collapses a backlog to the first send in flight and the latest queued behind it', async () => {
    const sent: number[] = [];
    const gate = defer<void>();
    const { request } = coalescePreview(
      async (value: number) => {
        sent.push(value);
        if (sent.length === 1) await gate.promise; // hold the first send in flight
        return value;
      },
      () => {},
    );

    // Five ticks of a fast drag, all while the first send is still in flight.
    request(1);
    await Promise.resolve();
    request(2);
    request(3);
    request(4);
    request(5);

    // Nothing but the first value has gone out yet; 2..5 are still queued.
    expect(sent).toEqual([1]);

    gate.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The backlog collapsed to the newest value, not all four in between.
    expect(sent).toEqual([1, 5]);
  });

  it('drops a result whose request was cancelled before it resolved', async () => {
    const applied: number[] = [];
    const gate = defer<number>();
    const { request, cancel } = coalescePreview(
      () => gate.promise,
      (result) => applied.push(result),
    );

    request(1);
    await Promise.resolve();
    cancel();
    gate.resolve(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(applied).toEqual([]);
  });

  it('accepts new requests again after a cancel', async () => {
    const applied: number[] = [];
    const { request, cancel } = coalescePreview(
      (value: number) => Promise.resolve(value),
      (result) => applied.push(result),
    );

    request(1);
    cancel();
    request(2);
    await Promise.resolve();
    await Promise.resolve();

    expect(applied).toEqual([2]);
  });
});
