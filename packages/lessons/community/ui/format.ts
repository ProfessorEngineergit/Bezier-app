/** Number formatting for cards. */

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes === 0 ? `${rest} s` : `${minutes}:${String(rest).padStart(2, '0')} min`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

export function formatChapters(count: number): string {
  return count === 1 ? '1 chapter' : `${count} chapters`;
}

const LEVEL_NAMES = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export const levelName = (level: keyof typeof LEVEL_NAMES): string => LEVEL_NAMES[level];
