/**
 * Settings sections matched by a start-page search, below the matching projects. Unscoped searches
 * look everywhere (`library-search.ts`), so "theme" finds the Settings section. Choosing one opens
 * it.
 */

import type { SettingsSection, SettingsTab } from './settings-catalog.js';

export function SettingsHits({
  hits,
  onOpen,
}: {
  hits: readonly SettingsSection[];
  onOpen: (tab: SettingsTab) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <section aria-label="Settings" className="library__hits">
      <h2>Settings</h2>
      <ul>
        {hits.map((hit) => (
          <li key={hit.id}>
            <button onClick={() => onOpen(hit.id)} type="button">
              <span>{hit.label}</span>
              <small>Settings / {hit.label}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
