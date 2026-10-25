/**
 * Parses numbers typed into fields, the same everywhere: `2in`, `10*2+3` and `1,5` give 50.8, 23
 * and 1.5 (audit F-031). Uses the document's expression language (`@bezier/core`): millimetres and
 * degrees by default, `cm`, `m`, `in`, `ft`, `rad` converted, arithmetic and common functions. A
 * comma between digits is a decimal comma unless the text calls a function.
 */
import { evaluate } from '@bezier/core';

export function typedNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const decimal = trimmed.includes('(') ? trimmed : trimmed.replace(/(\d),(\d)/g, '$1.$2');
  const result = evaluate(decimal, (name) => ({ ok: false, message: `"${name}" is not known.` }));
  return result.ok ? result.value : null;
}
