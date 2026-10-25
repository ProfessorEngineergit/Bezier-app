/**
 * Keeps the documented shortcuts (`EDITOR_SHORTCUTS`, shown in Settings) in sync with the handler.
 * Lives beside the handler because it reads its source, and the list's package has no filesystem.
 */

import { readFileSync } from 'node:fs';
import { EDITOR_SHORTCUTS } from '@bezier/ui';
import { describe, expect, it } from 'vitest';

const HANDLER = readFileSync(new URL('./use-shortcuts.ts', import.meta.url), 'utf8');

describe('EDITOR_SHORTCUTS', () => {
  it('documents every modified key the handler matches', () => {
    // The handler tests `event.key` against a literal for each of these. A new one added there and
    // not here would go unlisted, which is the drift this catches.
    const matched = [...HANDLER.matchAll(/event\.key(?:\.toLowerCase\(\))? === '([^']+)'/g)].map(
      (hit) => hit[1],
    );
    const documented = EDITOR_SHORTCUTS.map((entry) => entry.keys.toLowerCase());

    for (const raw of new Set(matched)) {
      const key = (raw ?? '').toLowerCase();
      expect(
        documented.some((keys) => keys.endsWith(`+${key}`) || keys === key),
        `no entry documents the "${raw}" binding`,
      ).toBe(true);
    }
  });

  it('says what each one does, in words rather than in ids', () => {
    for (const entry of EDITOR_SHORTCUTS) {
      expect(entry.label.length).toBeGreaterThan(2);
      expect(entry.label).not.toMatch(/^[a-z-]+$/);
    }
  });

  it('has no duplicate binding with the same scope', () => {
    const seen = new Set<string>();
    for (const entry of EDITOR_SHORTCUTS) {
      const key = `${entry.keys}/${entry.scope ?? ''}`;
      expect(seen.has(key), `${entry.keys} is listed twice`).toBe(false);
      seen.add(key);
    }
  });
});
