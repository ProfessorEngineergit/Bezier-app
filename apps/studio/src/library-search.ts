/**
 * Parses the start page search field, which searches projects and settings. A leading operator
 * narrows the scope, as in a mail client: `settings: theme`, `projects: bracket`.
 */

export type SearchScope = 'all' | 'projects' | 'settings';

export interface Search {
  scope: SearchScope;
  /** Lower-cased words, all of which must match. */
  terms: string[];
  /** The operator as typed, e.g. `settings`, or null. */
  operator: string | null;
}

/** Every recognised spelling of an operator, and its scope. */
const OPERATORS: Readonly<Record<string, SearchScope>> = {
  settings: 'settings',
  setting: 'settings',
  prefs: 'settings',
  preferences: 'settings',
  einstellungen: 'settings',
  projects: 'projects',
  project: 'projects',
  projekte: 'projects',
};

/** Operators offered as hints, in display order. */
export const OPERATOR_HINTS: readonly { operator: string; scope: SearchScope; label: string }[] = [
  { operator: 'settings:', scope: 'settings', label: 'Search only settings' },
  { operator: 'projects:', scope: 'projects', label: 'Search only projects' },
];

export function parseSearch(raw: string): Search {
  const text = raw.trimStart();
  const match = /^([a-zäöü]+):\s*/i.exec(text);
  const named = match?.[1]?.toLocaleLowerCase();
  const scope = named === undefined ? undefined : OPERATORS[named];
  const rest = scope === undefined || match === null ? text : text.slice(match[0].length);
  return {
    scope: scope ?? 'all',
    terms: rest.toLocaleLowerCase().split(/\s+/).filter(Boolean),
    operator: scope === undefined ? null : (named ?? null),
  };
}

/** Whether every term is found in `text`. */
export function matchesAll(text: string, terms: readonly string[]): boolean {
  const haystack = text.toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}
