/**
 * Blocks unwanted words and links in titles, descriptions and chapter names.
 *
 * A cheap first filter ahead of human review. Matches whole words after normalising common
 * disguises (accents, `1`→`i`, `@`→`a`), so words merely containing a blocked word pass.
 */

import { readFileSync } from 'node:fs';

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

// Control, bidi-override and zero-width characters can hide text from reviewers. Line breaks are
// allowed in descriptions.
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;
const LINK = /:\/\/|\bwww\.|\b[\w-]+\.(?:com|net|org|io|ru|cn|xyz|top|tk|ly|gg|me)\b|\S@\S+\.\S/i;

export const words = (text: string): string[] =>
  text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');

export function loadBlocklist(path: string): string[] {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/** A user-facing sentence saying what to change, or null when the text is fine. */
export function checkText(
  text: string,
  blocklist: readonly string[],
  field: string,
): string | null {
  if (INVISIBLE.test(text.replace(/[\n\r\t]/g, ' ')))
    return `The ${field} contains hidden characters. Retype it.`;
  if (LINK.test(text)) return `The ${field} contains a link or address. Remove it.`;
  const found = words(text);
  const joined = ` ${found.join(' ')} `;
  for (const entry of blocklist) {
    const phrase = words(entry).join(' ');
    if (phrase !== '' && joined.includes(` ${phrase} `)) {
      return `The ${field} contains a word this community does not allow. Rephrase it.`;
    }
  }
  return null;
}
