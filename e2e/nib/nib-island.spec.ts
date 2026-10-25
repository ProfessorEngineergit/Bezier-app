/**
 * Nib's island at the top of the window: its compact line and expanded card. Checks everything but
 * the feel: hidden at rest, questions are not lost to outside clicks, lessons fold and reopen,
 * crashes are reported while the app keeps working, Nib survives the app crashing, steps aside for
 * a long name, and Off means off.
 */

import type { Page } from '@playwright/test';
import { addBox, openApp, railButton } from '../app.js';
import { expect, test } from '../fixtures.js';

const island = (page: Page) => page.locator('.nib-island');

async function workspace(page: Page, name: string) {
  await page.getByRole('button', { name: /Workspace:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
}

async function withNib(page: Page, nib: 'off' | 'quiet' | 'friendly'): Promise<void> {
  await page.addInitScript((level) => {
    if (window !== window.top) return;
    const key = 'bezier.preferences';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const prefs = (stored.values as Record<string, unknown> | undefined) ?? stored;
    prefs.nib = level;
    localStorage.setItem(key, JSON.stringify(stored.values ? stored : prefs));
  }, nib);
}

test('at rest he is not there at all: nothing on the bar, nothing under it', async ({ page }) => {
  await openApp(page);
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
  // Hovering the middle of the top edge brings nothing either.
  await page.mouse.move(640, 300);
  await page.mouse.move(640, 4, { steps: 3 });
  await page.waitForTimeout(800);
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
});

test('the first time the app opens he says hello and the window waits; Show me starts the lesson', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.nib', JSON.stringify({ met: false, guides: [] }));
    localStorage.setItem('bezier.nib.offered', '[]');
  });
  await openApp(page);
  await expect(island(page)).toHaveAttribute('data-kind', 'speech', { timeout: 8000 });
  await expect(island(page)).toContainText("I'm Nib");
  await expect(island(page)).toContainText('Your first part');
  // Labelled as a lesson, with its length.
  await expect(island(page).locator('.nib-island__kicker')).toHaveText(/^Lesson · \d+ steps/);
  // A veil covers the window: a click beside him neither reaches the model nor dismisses him.
  await expect(page.locator('.nib-meeting')).toBeVisible();
  await page.mouse.click(640, 500);
  await page.keyboard.press('Escape');
  await expect(island(page)).toHaveAttribute('data-shape', 'card');
  await island(page).getByRole('button', { name: 'Show me' }).click();
  await expect(page.locator('.nib-meeting')).toHaveCount(0);
  // In a project the first step (leave the start page) is already done.
  await expect(island(page)).toContainText('Open Sketch');
  await expect(page.locator('.nib-ring:not([hidden])')).toHaveCSS('opacity', '1');
  // Shown once: marked as met, and the first project's own offer is not shown too.
  expect(await page.evaluate(() => localStorage.getItem('bezier.nib'))).toContain('"met":true');
});

test('the first time in a workspace he offers its lesson; Later and it is not offered again', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.nib.offered', JSON.stringify(['design']));
  });
  await openApp(page);
  await addBox(page);
  await workspace(page, 'Drawings');
  await expect(island(page)).toContainText('First time in Drawings', { timeout: 8000 });
  await island(page).getByRole('button', { name: 'Later' }).click();
  await expect(island(page)).not.toHaveAttribute('data-kind', 'speech');
  await workspace(page, 'Modeling');
  await workspace(page, 'Drawings');
  await page.waitForTimeout(2500);
  await expect(island(page)).not.toHaveAttribute('data-kind', 'speech');
});

test('a crash pops out of him, the app keeps working, and Not now sends him back', async ({
  page,
  consoleErrors,
}) => {
  test.skip(process.env.E2E_BUILT === '1', 'The forced failure exists only in development.');
  await openApp(page);
  await addBox(page);
  await page.evaluate(() => {
    (window as { __bezierBreak?: string }).__bezierBreak = 'Visualize';
  });
  await workspace(page, 'Visualize');
  await expect(island(page)).toHaveAttribute('data-kind', 'crash');
  await expect(island(page)).toContainText('That did not go as it should.');
  await expect(island(page)).toContainText('Visualize stopped working');
  // Nib made the offer, so the legacy crash prompt stays hidden.
  await expect(page.locator('.crash-prompt')).toHaveCount(0);

  // Not now ends it, and he goes back up.
  await island(page).getByRole('button', { name: 'Not now' }).click();
  await expect(island(page)).not.toHaveAttribute('data-kind', 'crash');
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden', { timeout: 5000 });
  // The app keeps responding.
  await workspace(page, 'Modeling');
  await expect(page.locator('canvas.viewport')).toBeVisible();
  consoleErrors.length = 0;
});

test('Send a report opens the report with the crash already written in', async ({
  page,
  consoleErrors,
}) => {
  await openApp(page);
  await page.evaluate(() => console.error('Visualize stopped working:', 'x is undefined'));
  await island(page).getByRole('button', { name: 'Send a report' }).click();
  const report = page.getByRole('region', { name: 'Report a problem' });
  await expect(report).toBeVisible();
  await expect(report.locator('input.image-field__input').first()).toHaveValue(
    'Visualize stopped working',
  );
  // The report window takes over: no card and nothing on the line while it is open.
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
  consoleErrors.length = 0;
});

test('with the app fallen over entirely, he is still there and can still open a report', async ({
  page,
  consoleErrors,
}) => {
  await openApp(page);
  // Simulate an uncaught React error: the app root's tree is removed and the window gets an error
  // event.
  await page.evaluate(() => {
    document.getElementById('root')?.replaceChildren();
    window.dispatchEvent(new ErrorEvent('error', { message: 'Cannot read properties of null' }));
  });
  await expect(page.locator('.titlebar')).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-kind', 'crash');
  await island(page).getByRole('button', { name: 'Send a report' }).click();
  await expect(page.getByRole('region', { name: 'Report a problem' })).toBeVisible();
  consoleErrors.length = 0;
});

test('he steps aside for a long name in a narrow window', async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.nib.offered', JSON.stringify(['design']));
  });
  await page.setViewportSize({ width: 720, height: 600 });
  await openApp(page);
  await addBox(page);
  await workspace(page, 'Drawings');
  // The offer collapsed into the line gives him something to move aside.
  await expect(island(page)).toHaveAttribute('data-shape', 'card', { timeout: 8000 });
  await page.keyboard.press('Escape');
  await expect(island(page)).toHaveAttribute('data-shape', 'compact');
  await page.locator('.titlebar__name').click();
  await page
    .getByRole('textbox', { name: 'Project name' })
    .fill('A bracket for the long shelf in the hall');
  await page.keyboard.press('Enter');
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
});

test('quiet, no first is said', async ({ page }) => {
  await withNib(page, 'quiet');
  await openApp(page);
  await addBox(page);
  await page.waitForTimeout(500);
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
});

test('switched off he is not there, and the old offer after a crash is back', async ({
  page,
  consoleErrors,
}) => {
  await withNib(page, 'off');
  await openApp(page);
  await expect(island(page)).toHaveCount(0);
  await page.evaluate(() => console.error('Visualize stopped working:', 'x is undefined'));
  await expect(page.locator('.crash-prompt')).toBeVisible();
  consoleErrors.length = 0;
});

test('nothing that needs an answer is lost to a click elsewhere, and Escape only folds it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.nib', JSON.stringify({ met: false, guides: [] }));
    localStorage.setItem('bezier.nib.offered', '[]');
  });
  await openApp(page);
  await expect(island(page)).toHaveAttribute('data-shape', 'card', { timeout: 8000 });
  // The first greeting is not lost to a click into the model: it waits for an answer.
  await page.mouse.click(640, 500);
  await expect(island(page)).toHaveAttribute('data-shape', 'card');
  await island(page).getByRole('button', { name: 'Show me' }).click();
  await expect(island(page)).toContainText('Open Sketch');
  await expect(island(page).locator('.nib-island__steps > span')).not.toHaveCount(0);

  // During a lesson the user clicks around the app; the step stays open.
  await page.mouse.click(640, 500);
  await page.waitForTimeout(400);
  await expect(island(page)).toHaveAttribute('data-shape', 'card');

  // Escape folds it; the line shows the lesson's progress, and a click reopens it.
  await page.keyboard.press('Escape');
  await expect(island(page)).toHaveAttribute('data-shape', 'compact');
  await expect(island(page)).toContainText(/Lesson · \d+ of \d+/);
  await island(page).locator('.nib-island__line').click();
  await expect(island(page)).toContainText('Open Sketch');

  // Only the × ends it.
  await island(page).getByRole('button', { name: 'End the lesson' }).click();
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
});

test('every lesson can be started again from Settings › Nib', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('button', { name: 'Nib', exact: true }).click();
  const starts = page
    .locator('.prefs-row')
    .filter({ has: page.getByRole('button', { name: /^(Start|Again)$/ }) });
  await expect(starts).toHaveCount(4);
  await starts.first().getByRole('button').click();
  // The first lesson starts in a new project and says so at the top.
  await expect(page.locator('canvas.viewport')).toBeVisible();
  await expect(island(page)).toHaveAttribute('data-shape', 'card', { timeout: 8000 });
  await expect(island(page).locator('.nib-island__kicker')).toContainText(
    'Lesson · Your first part',
  );
});

test('when the view stays slow he sweats, and Lighter display draws the model lighter', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openApp(page);
  await addBox(page);
  // Simulate a slow machine: every frame takes 80 ms, about a dozen frames a second.
  await page.evaluate(() => {
    const heavy = () => {
      const until = performance.now() + 80;
      while (performance.now() < until) {
        // Busy-wait, like software rendering of a heavy model.
      }
      if ((window as { __heavy?: boolean }).__heavy !== false) requestAnimationFrame(heavy);
    };
    requestAnimationFrame(heavy);
  });
  await expect(island(page)).toHaveAttribute('data-mood', 'strained', { timeout: 40_000 });
  await expect(island(page)).toContainText(/Getting slow|Struggling/);
  await page.evaluate(() => {
    (window as { __heavy?: boolean }).__heavy = false;
  });
  await island(page).locator('.nib-island__line').click();
  await island(page).getByRole('button', { name: 'Lighter display' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('bezier.preferences') ?? '{}');
        const values = stored.values ?? stored;
        return `${values.detail} ${values.glass}`;
      }),
    )
    .toBe('light solid');
});

test('a lesson starts from a clear screen: a sketch or a flyout left open is put down', async ({
  page,
}) => {
  await openApp(page);
  // Start inside a sketch.
  await railButton(page, 'Sketch').click();
  await expect(railButton(page, 'Finish Sketch')).toBeVisible();
  // Open the lesson from his menu at the top of the window.
  await page.mouse.move((page.viewportSize()?.width ?? 1280) / 2, 4);
  await page.locator('.nib-summon[data-out] .nib-summon__tab').click({ timeout: 3000 });
  await island(page).getByRole('button', { name: 'Your first part' }).click();
  await expect(railButton(page, 'Finish Sketch')).toHaveCount(0);
  await expect(railButton(page, 'Transform')).toBeVisible();
});

test('with nothing to say he waits at the top: resting the pointer there brings him out', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('bezier.nib', JSON.stringify({ met: true, guides: ['first-part'] }));
    localStorage.setItem('bezier.nib.offered', JSON.stringify(['design']));
  });
  await openApp(page);
  await expect(island(page)).toHaveAttribute('data-shape', 'hidden');
  const tab = page.locator('.nib-summon__tab');
  await expect(tab).toHaveCSS('opacity', '0');
  const width = page.viewportSize()?.width ?? 1280;
  // Passing over the title bar does not bring him out; resting there does.
  await page.mouse.move(width / 2, 4);
  await page.waitForTimeout(200);
  await expect(page.locator('.nib-summon[data-out]')).toHaveCount(0);
  await expect(page.locator('.nib-summon[data-out]')).toHaveCount(1, { timeout: 2000 });
  await tab.click();
  await expect(island(page)).toHaveAttribute('data-shape', 'card');
  await expect(island(page)).toHaveAttribute('data-kind', 'menu');
});

test('a question the app waits on is his, and nothing but an answer gets past it', async ({
  page,
}) => {
  // A box is not large, so lower the threshold to make it trigger the question.
  await page.addInitScript(() => {
    (globalThis as { __bezierLargeFaces?: number }).__bezierLargeFaces = 1;
  });
  await openApp(page);
  await addBox(page);
  // Simulation does not ask: it opens at once.
  await workspace(page, 'Simulation');
  await expect(page.getByRole('button', { name: /Workspace: Simulation/ })).toBeVisible();
  await expect(island(page)).not.toHaveAttribute('data-kind', 'question');
  await workspace(page, 'Modeling');

  await workspace(page, 'Drawings');
  const card = island(page).getByRole('alertdialog');
  await expect(card).toContainText('This model is very large');
  await expect(page.locator('.nib-meeting--ask')).toBeVisible();
  // His default answer has focus, like a dialog's default button.
  await expect(card.getByRole('button', { name: 'Open Drawings' })).toBeFocused();
  // It cannot be folded away: no button for it, and Escape or a click beside him do nothing.
  await expect(card.getByRole('button', { name: 'Fold away' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.click(640, 500);
  await expect(card).toBeVisible();
  // Focus is trapped: Tab cycles through his two answers.
  await page.keyboard.press('Tab');
  await expect(card.getByRole('button', { name: 'Stay here' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(card.getByRole('button', { name: 'Open Drawings' })).toBeFocused();

  await card.getByRole('button', { name: 'Stay here' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.nib-meeting--ask')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Workspace: Modeling/ })).toBeVisible();

  await workspace(page, 'Drawings');
  await island(page).getByRole('button', { name: 'Open Drawings' }).click();
  await expect(page.getByRole('button', { name: /Workspace: Drawings/ })).toBeVisible();
});

test('switched off, the question is the system’s again', async ({ page }) => {
  await withNib(page, 'off');
  await page.addInitScript(() => {
    (globalThis as { __bezierLargeFaces?: number }).__bezierLargeFaces = 1;
  });
  await openApp(page);
  await addBox(page);
  const asked = new Promise<string>((resolve) =>
    page.once('dialog', (dialog) => {
      resolve(dialog.message());
      void dialog.dismiss();
    }),
  );
  await workspace(page, 'Visualize');
  expect(await asked).toContain('This model is very large');
  await expect(page.getByRole('button', { name: /Workspace: Modeling/ })).toBeVisible();
});
