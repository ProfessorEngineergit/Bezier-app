/**
 * A small, dependency-free measurement harness. Reports percentiles rather than means, since a
 * good mean can hide a bad p99.
 */

export interface Measurement {
  name: string;
  runs: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface MeasureOptions {
  /** Discarded runs before recording, to let JIT and caches settle. */
  warmup?: number;
  runs?: number;
  /** Time cap so a slow path cannot stall the suite. */
  budgetMs?: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index] ?? Number.NaN;
}

/** Times an async operation repeatedly and summarises the distribution. */
export async function measure(
  name: string,
  work: () => Promise<unknown>,
  options: MeasureOptions = {},
): Promise<Measurement> {
  const warmup = options.warmup ?? 3;
  const runs = options.runs ?? 20;
  const budget = options.budgetMs ?? 60_000;

  for (let i = 0; i < warmup; i++) await work();

  const samples: number[] = [];
  const deadline = performance.now() + budget;

  for (let i = 0; i < runs && performance.now() < deadline; i++) {
    const started = performance.now();
    await work();
    samples.push(performance.now() - started);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  return {
    name,
    runs: samples.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    min: sorted[0] ?? Number.NaN,
    max: sorted[sorted.length - 1] ?? Number.NaN,
  };
}

function ms(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value < 10 ? `${value.toFixed(2)}` : `${value.toFixed(1)}`;
}

export function reportTable(measurements: readonly Measurement[]): void {
  const width = Math.max(28, ...measurements.map((m) => m.name.length));
  const head = `${'measurement'.padEnd(width)}  ${'p50'.padStart(8)}  ${'p95'.padStart(8)}  ${'p99'.padStart(8)}  ${'max'.padStart(8)}   runs`;

  console.log(head);
  console.log('-'.repeat(head.length));
  for (const m of measurements) {
    console.log(
      `${m.name.padEnd(width)}  ${ms(m.p50).padStart(8)}  ${ms(m.p95).padStart(8)}  ` +
        `${ms(m.p99).padStart(8)}  ${ms(m.max).padStart(8)}   ${String(m.runs).padStart(4)}`,
    );
  }
  console.log('\nall figures in milliseconds\n');
}

/** Checks a measurement's p99 against its budget and prints the result. */
export function checkBudget(m: Measurement, budgetMs: number): boolean {
  const met = m.p99 <= budgetMs;
  const verdict = met ? 'within' : 'OVER';
  console.log(
    `  ${verdict.padEnd(6)} ${m.name}: p99 ${ms(m.p99)} ms against a ${budgetMs} ms budget`,
  );
  return met;
}
