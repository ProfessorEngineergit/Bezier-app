/**
 * Limits for community lessons, shared by the server and the app so both agree on what is
 * accepted. Tighter than the `.bezierlesson` format, since shared lessons are downloaded by others.
 */

export const LIMITS = {
  /** Normalised package size in bytes. */
  packageBytes: 256_000_000,
  /** Video length in seconds. */
  durationSeconds: 30 * 60,
  title: 120,
  description: 2_000,
  /** Checkpoints. */
  states: 200,
  events: 200_000,
  cuts: 1_000,
  avatarCues: 1_000,
  /** Project text size per checkpoint in bytes. */
  projectBytes: 2_000_000,
  /** Maximum length of chapter and edit titles. */
  chapterTitle: 120,
} as const;

/** Formats of server ids and hashes, checked before use in a URL or file name. */
export const ID_PATTERN = /^[0-9a-f]{32}$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
