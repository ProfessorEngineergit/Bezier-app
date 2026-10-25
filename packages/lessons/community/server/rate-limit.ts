/** A fixed-window rate limiter per key. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Whether `key` may proceed; counts the attempt either way. */
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) this.sweep(now);
    const hit = this.hits.get(key);
    if (hit === undefined || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    hit.count += 1;
    return hit.count <= this.max;
  }

  private sweep(now: number): void {
    for (const [key, hit] of this.hits) if (hit.resetAt <= now) this.hits.delete(key);
  }
}
