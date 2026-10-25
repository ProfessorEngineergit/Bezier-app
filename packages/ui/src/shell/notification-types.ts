export type Tone = 'info' | 'ok' | 'fail';

export interface Notice {
  id: string;
  /** One line in user terms: "Copied to clipboard". */
  title: string;
  /** Details, if any: what was copied, or why it failed. */
  detail?: string;
  tone?: Tone;
  /**
   * Stays until dismissed, for what must not be missed (e.g. unsaved work, an engine restart).
   */
  sticky?: boolean;
}
