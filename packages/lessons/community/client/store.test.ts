import { describe, expect, it } from 'vitest';
import { lessonsOf, pluginsOf, readStore, setStoreAddress, setStoreOn } from './store.js';

function memory(): Storage {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  } as Storage;
}

describe('the community store', () => {
  it('is off until it is turned on, and a store without an address cannot be on', () => {
    const storage = memory();
    setStoreOn(true, storage);
    // Bezier's own store has no address yet.
    expect(readStore(storage, 'alpha')).toMatchObject({ url: '', on: false, custom: false });
    setStoreAddress('https://cad.example.org/', storage);
    expect(readStore(storage, 'alpha')).toMatchObject({
      url: 'https://cad.example.org',
      name: 'cad.example.org',
      on: true,
      custom: true,
    });
    setStoreOn(false, storage);
    expect(readStore(storage, 'alpha').on).toBe(false);
  });

  it('is off below alpha whatever was chosen, and back when the channel is alpha', () => {
    const storage = memory();
    setStoreAddress('https://cad.example.org', storage);
    setStoreOn(true, storage);
    expect(readStore(storage, 'stable').on).toBe(false);
    expect(readStore(storage, 'stable').url).toBe('https://cad.example.org');
    expect(readStore(storage, 'beta').on).toBe(false);
    expect(readStore(storage, 'alpha').on).toBe(true);
  });

  it('is one address for lessons and for plugins', () => {
    const storage = memory();
    setStoreAddress('http://127.0.0.1:8790', storage);
    const store = readStore(storage, 'alpha');
    expect(lessonsOf(store).url).toBe('http://127.0.0.1:8790/lessons');
    expect(pluginsOf(store).url).toBe('http://127.0.0.1:8790/plugins');
  });

  it('refuses an address that is not one, and forgets a typed one when cleared', () => {
    const storage = memory();
    expect(() => setStoreAddress('http://cad.example.org', storage)).toThrow(/https/);
    setStoreAddress('https://cad.example.org', storage);
    setStoreAddress('', storage);
    expect(readStore(storage).custom).toBe(false);
  });
});
