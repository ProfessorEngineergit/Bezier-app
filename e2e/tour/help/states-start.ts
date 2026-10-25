import { addBox, openItems, railButton } from '../../app.js';
import { expect } from '../../fixtures.js';
import type { State } from './frame.js';
import { boxAtRest, fillLibrary, goHome, onCanvas, twoBodies, userView } from './world.js';

/** Each state shows the editor as users see it, not as the tests configure it (see `userView`). */
const asUser =
  (state: State): State =>
  async (page) => {
    await userView(page);
    return state(page);
  };

const STATES: Record<string, State> = {
  'editor-at-a-glance-layout': async (page) => {
    await boxAtRest(page);
    return {
      points: [
        page.getByRole('button', { name: /Workspace:/ }),
        page.getByRole('button', { name: 'Export', exact: true }),
        railButton(page, 'Items'),
        railButton(page, 'Sketch'),
        page.getByRole('navigation', { name: 'Orientation' }),
        railButton(page, 'Quick settings'),
      ],
      whole: true,
    };
  },
  'editor-at-a-glance-rail': async (page) => {
    // The flyout the box was made from stays open: it is the subject of the picture.
    await addBox(page);
    await expect(railButton(page, 'Extrude')).toBeVisible();
    await railButton(page, 'Tools').hover();
    // Point at the name, not the icon: an arrow from the right would cross the names above it.
    const extrude = page.locator('.rail__flyout .rail__label', { hasText: 'Extrude' });
    return {
      points: [extrude],
      area: [railButton(page, 'Sketch'), railButton(page, 'Tools'), railButton(page, 'Split')],
    };
  },
  'navigate-settings': async (page) => {
    await goHome(page);
    await page
      .getByRole('navigation', { name: 'More' })
      .getByRole('button', { name: 'Settings' })
      .click();
    await page
      .getByRole('navigation', { name: 'Preference sections' })
      .getByRole('button', { name: 'Interaction' })
      .click();
    const preset = page
      .getByRole('combobox', { name: 'Navigate like' })
      .or(page.getByLabel('Navigate like'));
    return { points: [preset], area: [preset, page.getByText('Mouse', { exact: true }).first()] };
  },
  'projects-start': async (page) => {
    await fillLibrary(page);
    const newProject = page.getByRole('button', { name: 'New Project' }).first();
    await page.mouse.move(700, 800);
    return {
      points: [
        newProject,
        page.locator('.tile__face').first(),
        page.getByRole('button', { name: 'New folder' }),
      ],
      whole: true,
    };
  },
  'projects-menu': async (page) => {
    await fillLibrary(page);
    const card = page.locator('.tile', { hasText: 'Grid plate' });
    await card.getByRole('button', { name: 'More options' }).click();
    const menu = page.getByRole('menu', { name: /Actions for/ });
    await expect(menu).toBeVisible();
    return {
      points: [menu.getByRole('menuitem', { name: 'Move to Folder…' })],
      area: [card, menu],
    };
  },
  'search-results': async (page) => {
    await fillLibrary(page);
    const field = page.getByRole('searchbox', { name: 'Search projects' });
    await field.click();
    await field.fill('frame');
    await expect(page.getByRole('region', { name: 'Wiki' })).toBeVisible();
    return {
      points: [field],
      area: [
        field,
        page.locator('.tile').first(),
        page.getByRole('region', { name: 'Settings' }),
        page.getByRole('region', { name: 'Wiki' }),
      ],
    };
  },
  'workspaces-menu': async (page) => {
    await page.getByRole('button', { name: /Workspace:/ }).click();
    const visualize = page.getByRole('menuitemradio', { name: /^Visualize/ });
    await expect(visualize).toBeVisible();
    return {
      points: [visualize.locator('.menu__itemLabel')],
      area: [page.getByRole('button', { name: /Workspace:/ }), visualize],
    };
  },
  'items-list': async (page) => {
    await twoBodies(page);
    await openItems(page);
    // Rename as a user would, then hide the second: the eye icon stays on the hidden one.
    for (const [row, name] of [
      ['Body 1', 'Base'],
      ['Body 2', 'Post'],
    ] as const) {
      await page.locator('.tree-row[data-kind="body"]', { hasText: row }).dblclick();
      const rename = page.getByRole('textbox', { name: `Rename ${row}` });
      await rename.fill(name);
      await rename.press('Enter');
    }
    await page.getByRole('button', { name: 'Hide Post' }).click();
    await page.mouse.move(900, 700);
    const eye = page.getByRole('button', { name: 'Show Post' });
    await expect(eye).toBeVisible();
    return {
      points: [eye, page.locator('.items-panel__filter')],
      area: [
        page.locator('.items-panel__filter'),
        page.locator('.tree-row[data-kind="sketch"]').last(),
        await onCanvas(page, 0.3, 0.25, 0.75, 0.7),
      ],
    };
  },
  'items-filter': async (page) => {
    await twoBodies(page);
    await openItems(page);
    await page.locator('.items-panel__filter').click();
    const sketches = page.getByRole('menuitemradio', { name: 'Sketches' });
    await expect(sketches).toBeVisible();
    return {
      points: [sketches],
      area: [
        page.locator('.items-panel__filter'),
        sketches,
        await onCanvas(page, 0.3, 0.25, 0.6, 0.6),
      ],
    };
  },
  'community-docs': async (page) => {
    await goHome(page);
    await page
      .getByRole('navigation', { name: 'Library' })
      .getByRole('button', { name: /^Community/ })
      .click();
    const collapse = page.getByRole('button', { name: 'Collapse' });
    const write = page.getByRole('button', { name: 'New article' });
    await expect(write).toBeVisible();
    await page.mouse.move(700, 800);
    return {
      points: [collapse, write],
      area: [page.getByRole('heading', { name: /^Community/ }), collapse, write],
    };
  },
  'community-lessons': async (page) => {
    await goHome(page);
    await page
      .getByRole('navigation', { name: 'Library' })
      .getByRole('button', { name: /^Community/ })
      .click();
    await page.getByText('Lessons', { exact: true }).first().click();
    const settings = page.getByRole('button', { name: 'Community settings' });
    await expect(settings).toBeVisible();
    return {
      points: [settings],
      area: [page.getByRole('heading', { name: /^Community/ }), settings],
    };
  },
};

export const START: Record<string, State> = Object.fromEntries(
  Object.entries(STATES).map(([name, state]) => [name, asUser(state)]),
);
