/**
 * Asks the user a yes/no question: through Nib while he is on (`IslandHost`), otherwise via the
 * native dialog (desktop) or the browser's. True means `yes`; closing the dialog means `no`.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface Question {
  title: string;
  message: string;
  /** The answer that costs something. */
  yes: string;
  /** The answer that does not, and what closing the dialog means. */
  no: string;
  /** The highlighted answer; defaults to the one that costs nothing. */
  suggest?: 'yes' | 'no';
}

let nibAsks: ((question: Question) => Promise<boolean>) | null = null;

/** Routes questions to Nib while he is on; the returned function undoes this. */
export function letNibAsk(asker: (question: Question) => Promise<boolean>): () => void {
  nibAsks = asker;
  return () => {
    if (nibAsks === asker) nibAsks = null;
  };
}

export async function askQuestion(question: Question): Promise<boolean> {
  if (nibAsks !== null) return nibAsks(question);
  if (isTauri()) {
    try {
      const { title, message, yes, no } = question;
      return await invoke<boolean>('ask_question', { title, message, yes, no });
    } catch {
      return false;
    }
  }
  // The browser dialog only offers OK/Cancel: OK is the costly answer, and the text says so.
  return window.confirm(
    `${question.title}\n\n${question.message}\n\nOK: ${question.yes}. Cancel: ${question.no}.`,
  );
}
