import { describe, expect, it } from 'vitest';
import { loadDocs, withKeys } from './docs.js';

describe('the keys an article names', () => {
  const docs = loadDocs();

  it("fall back to Bezier's own keymap, which the docs hold under 'native'", () => {
    // The fallback must name a preset the app has, or every action prints "no key".
    expect(docs.keymap.presets.some((preset) => preset.id === 'native')).toBe(true);
    const text = withKeys('Press {{key:extrude}}.', docs, 'a-preset-that-does-not-exist');
    expect(text).not.toContain('no key');
    expect(text).toMatch(/Press `[^`]+`\./);
  });

  it("use the person's own preset when it has a key", () => {
    const own = docs.keymap.presets.find((preset) => preset.id !== 'native');
    expect(own).toBeDefined();
    const action = docs.keymap.actions.find((each) => own !== undefined && each.keys[own.id]);
    expect(action).toBeDefined();
    const text = withKeys(`{{key:${action?.id}}}`, docs, own?.id ?? '');
    expect(text).toBe(`\`${action?.keys[own?.id ?? '']}\``);
  });
});
