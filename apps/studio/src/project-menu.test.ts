import { describe, expect, it } from 'vitest';
import { projectMenu } from './project-menu.js';

describe('projectMenu', () => {
  it('offers the actions a project tile has', () => {
    const actions = projectMenu().map((item) => item.action);
    for (const expected of ['open', 'rename', 'move-to-folder', 'export', 'delete'] as const) {
      expect(actions).toContain(expected);
    }
  });

  it('does not expose document visibility, which nothing implements', () => {
    expect(projectMenu().map((item) => item.action)).not.toContain('visibility');
  });

  it('marks deletion, so it never reads as ordinary', () => {
    expect(projectMenu().find((item) => item.action === 'delete')?.destructive).toBe(true);
  });

  it('puts the destructive action last, after everything harmless', () => {
    const actions = projectMenu().map((item) => item.action);
    expect(actions.indexOf('rename')).toBeLessThan(actions.indexOf('delete'));
    expect(actions.indexOf('delete')).toBe(actions.length - 1);
  });

  it("gives a lesson's project a way out to the ordinary projects and no folder", () => {
    const actions = projectMenu(true).map((item) => item.action);
    expect(actions).toContain('save-as-project');
    expect(actions).not.toContain('move-to-folder');
    expect(actions.indexOf('delete')).toBe(actions.length - 1);
  });
});
