/** Formatting of durations and dates for display. */

/** 75 → "1:15"; past an hour "1:02:05". Negative or broken input reads as zero. */
export function clock(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const s = String(whole % 60).padStart(2, '0');
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The clock with tenths, for the edit view's ruler and playhead: "0:01.5". */
export function clockFine(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const tenths = Math.round(safe * 10) % 10;
  return `${clock(Math.floor(Math.round(safe * 10) / 10))}.${tenths}`;
}

/** How long a lesson is, roughly: "45 s", "3 min", "1 h 20 min". */
export function lengthWords(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  if (whole < 60) return `${whole} s`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "28 Sep 2026", or the raw text when it is not a date this runtime can read. */
export function dateWords(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** "3 chapters", "1 chapter". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
