/**
 * Formatting of running-task status for the status strip, kept separate from the component so it
 * can be tested. Shows rate and time remaining, like a file transfer.
 */

/** A running task, as reported in the title bar. */
export interface RunningTask {
  id: string;
  /** User-facing description: "Exporting bracket.step". */
  label: string;
  /**
   * Progress, 0 to 1. Absent when unknown (kernel operations cannot report progress); the strip
   * then shows an indeterminate animation instead of a number.
   */
  progress?: number;
  /** Bytes per second, for tasks that move bytes. */
  bytesPerSecond?: number;
  /** Bytes remaining; with a rate this gives a time estimate. */
  bytesRemaining?: number;
  /** Current phase, one word: "Reading", "Building". */
  phase?: string;
}

/**
 * A fraction as a percentage with two decimals and a decimal comma: "42,17%". Two decimals make
 * long imports visibly progress.
 */
export function formatPercent(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  return `${(clamped * 100).toFixed(2).replace('.', ',')}%`;
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** A transfer rate: one decimal below 100, none above ("9.8 MB/s", "98 MB/s"). */
export function formatRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) return '';

  let value = bytesPerSecond;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 100 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}/s`;
}

/** Time remaining, or an empty string when the rate is zero or the inputs are invalid. */
export function formatRemaining(bytesRemaining: number, bytesPerSecond: number): string {
  if (!Number.isFinite(bytesRemaining) || !Number.isFinite(bytesPerSecond)) return '';
  if (bytesRemaining <= 0 || bytesPerSecond <= 0) return '';

  const seconds = Math.round(bytesRemaining / bytesPerSecond);
  if (seconds < 1) return 'almost done';
  if (seconds < 60) return `${seconds}s left`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s left`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}

/**
 * The full caption for one task: percentage, rate, estimate. Built here so the separator logic
 * (no leading or doubled bullet when a part is missing) is in one testable place.
 */
export function describeTask(task: RunningTask): string {
  const parts: string[] = [];

  if (task.phase !== undefined && task.phase !== '') parts.push(task.phase);
  if (task.progress !== undefined && Number.isFinite(task.progress)) {
    parts.push(formatPercent(task.progress));
  }
  if (task.bytesPerSecond !== undefined) {
    const rate = formatRate(task.bytesPerSecond);
    if (rate !== '') parts.push(rate);
  }
  if (task.bytesRemaining !== undefined && task.bytesPerSecond !== undefined) {
    const left = formatRemaining(task.bytesRemaining, task.bytesPerSecond);
    if (left !== '') parts.push(left);
  }

  return parts.join(' · ');
}
