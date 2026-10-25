/**
 * The rebuild cache. Each feature's output is keyed by its parameters plus everything upstream
 * (ADR 0007), so an edit reruns only the features after it. Also used to recover after a kernel
 * worker crash (ADR 0009). A 40-pocket block takes about 87 ms to rebuild uncached.
 */

import type { GeometryKernel, ShapeId } from '@bezier/kernel';
import type { NamingSnapshot } from './naming.js';

export interface CacheEntry {
  /** The body this feature produced; not disposed while cached. */
  body: ShapeId;
  /** Naming state after this feature, restored on a hit. */
  naming: NamingSnapshot;
}

/**
 * Maximum cached outputs. Each pins a shape in kernel memory outside the JS heap, so this is a
 * memory budget.
 */
const DEFAULT_CAPACITY = 256;

/** LRU store of feature outputs, using `Map` insertion order as recency order. */
export class RebuildCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #capacity: number;
  #hits = 0;
  #misses = 0;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    this.#capacity = Math.max(1, capacity);
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      this.#misses++;
      return undefined;
    }
    // Re-insert so this becomes the most recently used.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    this.#hits++;
    return entry;
  }

  /** Stores a feature's output. Evicted shapes are disposed; nothing else owns them. */
  async set(key: string, entry: CacheEntry, kernel: GeometryKernel): Promise<void> {
    const existing = this.#entries.get(key);
    if (existing !== undefined && existing.body !== entry.body) {
      await kernel.dispose(existing.body);
    }

    this.#entries.set(key, entry);

    while (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next();
      if (oldest.done === true) break;
      const evicted = this.#entries.get(oldest.value);
      this.#entries.delete(oldest.value);
      if (evicted !== undefined) await kernel.dispose(evicted.body);
    }
  }

  /** Releases every cached shape. Call before dropping the cache. */
  async clear(kernel: GeometryKernel): Promise<void> {
    for (const entry of this.#entries.values()) await kernel.dispose(entry.body);
    this.#entries.clear();
  }

  /**
   * Hit statistics. A collapsing hit rate usually means a parameter is not canonically
   * serialised.
   */
  stats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.#hits + this.#misses;
    return {
      hits: this.#hits,
      misses: this.#misses,
      size: this.#entries.size,
      hitRate: total === 0 ? 0 : this.#hits / total,
    };
  }
}

/**
 * Fixed-length fingerprint of a cache key, for chaining into the next key. Embedding full upstream
 * keys grows exponentially and overflows the string limit after a few dozen features.
 *
 * 128-bit cyrb128 plus the text length; a collision would return another feature's geometry.
 */
export function fingerprint(text: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = (n: number) => ((n ^ 0) >>> 0).toString(16).padStart(8, '0');
  return `${hex(h1 ^ h2 ^ h3 ^ h4)}${hex(h2 ^ h1)}${hex(h3 ^ h1)}${hex(h4 ^ h1)}:${text.length}`;
}
