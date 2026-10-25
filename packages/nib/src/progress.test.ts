import { describe, expect, it } from 'vitest';
import { recall, remember } from './progress.js';

function storage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('bezier.nib', initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('what Nib remembers', () => {
  it('starts knowing nothing', () => {
    expect(recall(storage())).toEqual({ met: false, guides: [] });
    expect(recall(null)).toEqual({ met: false, guides: [] });
  });

  it('keeps what it was told', () => {
    const s = storage();
    remember(s, { met: true, guides: ['first-part'] });
    expect(recall(s)).toEqual({ met: true, guides: ['first-part'] });
  });

  it('survives damaged storage and storage that refuses', () => {
    expect(recall(storage('{'))).toEqual({ met: false, guides: [] });
    expect(recall(storage('{"met":"yes","guides":[1,"a"]}'))).toEqual({
      met: false,
      guides: ['a'],
    });
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(() => remember(refusing, { met: true, guides: [] })).not.toThrow();
  });
});
