/**
 * App messages in notice form. Usually one sentence (`say('Select an edge first.')`). A refusal
 * with a reason ("Fillet could not be applied: the radius does not fit") is split into a title and
 * the reason below it. Anything richer is passed as a `Said`.
 */

import type { Tone } from '@bezier/ui';

export interface Said {
  title: string;
  detail?: string;
  tone?: Tone;
  /** Stays until dismissed. */
  sticky?: boolean;
  /**
   * Shown at most once per device; the key is stored when shown. For standing facts about the app.
   */
  once?: string;
}

/** "X could not be applied: why", the shape of every refusal with a reason. */
const REFUSED = /^(.+? could not be [a-z]+(?: [a-z]+)?): (.+)$/s;

export function spoken(message: string | Said): Said {
  if (typeof message !== 'string') return message;
  const refused = REFUSED.exec(message);
  if (refused !== null) {
    const [, title = message, reason = ''] = refused;
    return { title, detail: reason.charAt(0).toUpperCase() + reason.slice(1), tone: 'fail' };
  }
  return { title: message };
}

/** Whether two notices say the same thing. */
export function sameSaid(a: Said, b: Said): boolean {
  return a.title === b.title && a.detail === b.detail;
}
