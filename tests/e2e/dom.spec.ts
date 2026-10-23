import { expect, test } from '@playwright/test';
import {
  card,
  cardBox,
  cardCount,
  cards,
  currentZoom,
  expectBoardReady,
  expectNoOverlappingCards,
  findEmptyPoint,
  rendererBadge,
  viewportHasNoScrollbars,
  watchConsole,
  zoomLevel,
} from './helpers';

test('uses the DOM renderer automatically when HTML-in-Canvas is absent', async ({ page }) => {
  const supportsCanvas = await page.evaluate(
    () =>
      'drawElementImage' in CanvasRenderingContext2D.prototype &&
      'requestPaint' in HTMLCanvasElement.prototype,
  );
  test.skip(supportsCanvas, 'This browser has the HTML-in-Canvas API');

  const consoleProblems = watchConsole(page);
  await page.goto('/');
  await expectBoardReady(page, 'DOM');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(consoleProblems.messages).toEqual([]);
});

test('falls back to DOM without losing the board when canvas is forced', async ({ page }) => {
  const supportsCanvas = await page.evaluate(
    () =>
      'drawElementImage' in CanvasRenderingContext2D.prototype &&
      'requestPaint' in HTMLCanvasElement.prototype,
  );
  test.skip(supportsCanvas, 'This browser has the HTML-in-Canvas API');

  const consoleProblems = watchConsole(page);
  await page.goto('/?render=canvas');
  await expectBoardReady(page, 'DOM');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(216);
  expect(consoleProblems.messages).toEqual([]);
});

test('loads the seeded wall in DOM mode with complete chrome', async ({ page }) => {
  const consoleProblems = watchConsole(page);
  await page.goto('/?render=dom');
  await expectBoardReady(page, 'DOM');

  await expect(rendererBadge(page)).toHaveAttribute('data-mode', 'dom');
  await expect(cards(page)).toHaveCount(216);
  await expect(card(page, 'card-000')).toContainText('The wall is real');
  await expect(card(page, 'card-000')).toContainText('needle');
  await expect(page.locator('canvas')).toHaveCount(0);
  const addButton = page.getByRole('button', { name: 'Add note at the centre of the view' });
  await expect(addButton).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.board')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(addButton).toBeFocused();
  const helpButton = page.getByRole('button', { name: 'Help and shortcuts' });
  await expect(helpButton).toBeVisible();
  await helpButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A wall of live HTML' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(helpButton).toBeFocused();
  await viewportHasNoScrollbars(page);
  await expectNoOverlappingCards(page);

  expect(consoleProblems.messages).toEqual([]);
});

test('pans, zooms, fits, and selects without remounting cards', async ({ page }) => {
  const consoleProblems = watchConsole(page);
  await page.goto('/?render=dom');
  await expectBoardReady(page, 'DOM');

  const cardOne = card(page, 'card-001');
  const cardHandle = await cardOne.elementHandle();
  const initialZoom = await currentZoom(page);

  await cardOne.click();
  await expect(cardOne).toHaveAttribute('data-selected', 'true');
  await expect(cardOne).toHaveClass(/is-selected/);

  const emptyForClear = await findEmptyPoint(page);
  await page.mouse.click(emptyForClear.x, emptyForClear.y);
  await expect(cardOne).toHaveAttribute('data-selected', 'false');

  const checkbox = cardOne.locator('input[type="checkbox"]').first();
  const checkedBefore = await checkbox.isChecked();
  await checkbox.click();
  expect(await checkbox.isChecked()).toBe(!checkedBefore);

  await page.getByRole('button', { name: 'Add note at the centre of the view' }).click();
  await expect(cardCount(page)).toHaveText('217 cards');
  expect(await checkbox.isChecked()).toBe(!checkedBefore);

  const start = await cardBox(page, 'card-001');
  const empty = await findEmptyPoint(page);
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x + 130, empty.y + 70, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => (await cardBox(page, 'card-001')).x).toBeGreaterThan(start.x + 80);

  const afterPan = await cardBox(page, 'card-001');
  expect(afterPan.y).toBeGreaterThan(start.y + 30);

  const beforeWheel = await cardBox(page, 'card-001');
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.wheel(0, 260);
  await expect
    .poll(async () => (await cardBox(page, 'card-001')).y)
    .toBeLessThan(beforeWheel.y - 120);

  const beforeZoom = await currentZoom(page);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -260);
  await page.keyboard.up('Control');
  await expect.poll(() => currentZoom(page)).toBeGreaterThan(beforeZoom + 10);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  const afterButtonZoom = await currentZoom(page);
  expect(afterButtonZoom).toBeGreaterThan(beforeZoom + 10);

  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => currentZoom(page)).toBeLessThan(afterButtonZoom);

  await page.getByRole('button', { name: 'Fit the whole board in the view' }).click();
  await expect.poll(() => currentZoom(page)).toBeLessThan(initialZoom);
  await page.getByRole('button', { name: /Reset to 100 percent/i }).click();
  await expect.poll(() => currentZoom(page)).toBe(100);

  expect(await cardOne.evaluate((element, previous) => element === previous, cardHandle)).toBe(
    true,
  );
  await expect(zoomLevel(page)).toHaveText('100%');
  expect(consoleProblems.messages).toEqual([]);
});
