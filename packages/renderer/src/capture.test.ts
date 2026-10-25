import { describe, expect, it } from 'vitest';
import { capture } from './capture.js';

/** The part of a renderer a shot touches, with a canvas that hands back a blob on the next tick. */
function fakeRenderer() {
  const size = { x: 800, y: 600 };
  const sizes: [number, number][] = [];
  return {
    size,
    sizes,
    renderer: {
      getSize(target: { x: number; y: number }) {
        target.x = size.x;
        target.y = size.y;
        return target;
      },
      setSize(x: number, y: number) {
        size.x = x;
        size.y = y;
        sizes.push([x, y]);
      },
      setClearAlpha() {},
      render() {},
      domElement: {
        toBlob(done: (blob: Blob | null) => void) {
          setTimeout(() => done(new Blob(['x'])), 5);
        },
      },
    },
  };
}

describe('capture', () => {
  it('puts the size back exactly, even when two shots are asked for at once', async () => {
    const { renderer, size } = fakeRenderer();
    const shoot = () =>
      capture(renderer as never, {} as never, {} as never, { scale: 0.5 }, () => undefined);
    await Promise.all([shoot(), shoot(), shoot()]);
    expect(size).toEqual({ x: 800, y: 600 });
  });

  it('keeps going after a shot that failed', async () => {
    const { renderer, size } = fakeRenderer();
    let calls = 0;
    renderer.domElement.toBlob = (done) => {
      calls += 1;
      if (calls === 1) throw new Error('no canvas');
      setTimeout(() => done(new Blob(['x'])), 1);
    };
    const options = { scale: 0.5 };
    const first = capture(renderer as never, {} as never, {} as never, options, () => undefined);
    const second = capture(renderer as never, {} as never, {} as never, options, () => undefined);
    await expect(first).rejects.toThrow();
    await expect(second).resolves.toBeInstanceOf(Blob);
    expect(size.x).toBe(800);
  });
});
