import { describe, expect, it } from 'vitest';
import { fingerprint } from './cache.js';

describe('the cache key fingerprint', () => {
  it('is the same for the same text and differs for different text', () => {
    expect(fingerprint('extrude|{"distance":10}|root|extrude-1')).toBe(
      fingerprint('extrude|{"distance":10}|root|extrude-1'),
    );
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
    expect(fingerprint('ab')).not.toBe(fingerprint('ba'));
  });

  it('stays the same size however long the chain gets', () => {
    // A key that embeds the last one, re-escaped, grows exponentially and overflows the string
    // limit on a long history.
    let key = 'root';
    for (let i = 0; i < 1000; i += 1) key = fingerprint(`extrude|{"distance":${i}}|${key}|f-${i}`);
    expect(key.length).toBeLessThan(48);
  });

  it('has no collisions over many close inputs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50_000; i += 1) seen.add(fingerprint(`extrude|{"distance":${i}}|root`));
    expect(seen.size).toBe(50_000);
  });
});
