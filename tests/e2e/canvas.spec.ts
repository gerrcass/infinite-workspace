import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  card,
  cardBox,
  cards,
  currentZoom,
  expectBoardReady,
  findEmptyPoint,
  viewportHasNoScrollbars,
  watchConsole,
} from './helpers';

test('paints live cards into canvas and hit-tests them at camera coordinates', async ({ page }) => {
  const consoleProblems = watchConsole(page);
  await page.goto('/');
  await expectBoardReady(page, 'Canvas');

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('content', 'drawable');
  await expect(canvas).toHaveAttribute('layoutsubtree', '');
  await expect(page.locator('canvas > .card[drawable]')).toHaveCount(216);
  await expect(page.locator('canvas > .card')).toHaveCount(216);

  const backing = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    return {
      width: target.width,
      height: target.height,
      clientWidth: target.clientWidth,
      clientHeight: target.clientHeight,
      dpr: window.devicePixelRatio,
    };
  });
  expect(backing.width).toBe(Math.round(backing.clientWidth * backing.dpr));
  expect(backing.height).toBe(Math.round(backing.clientHeight * backing.dpr));

  const welcome = card(page, 'card-000');
  await welcome.click();
  await expect(welcome).toHaveAttribute('data-selected', 'true');
  const welcomeHandle = await welcome.elementHandle();

  mkdirSync('test-results/artifacts', { recursive: true });
  await page.screenshot({ path: 'test-results/artifacts/canvas-board.png' });

  const initialZoom = await currentZoom(page);
  const body = card(page, 'card-001').locator('.card__body');
  const bodyBox = await body.boundingBox();
  if (!bodyBox) {
    throw new Error('Card body has no painted bounding box');
  }
  const anchor = {
    x: bodyBox.x + Math.min(60, bodyBox.width / 3),
    y: bodyBox.y + Math.min(20, bodyBox.height / 3),
  };
  await page.mouse.move(anchor.x, anchor.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -260);
  await page.keyboard.up('Control');

  await expect.poll(() => currentZoom(page)).toBeGreaterThan(initialZoom + 15);

  const checkbox = card(page, 'card-001').locator('input[type="checkbox"]').first();
  const checkedBefore = await checkbox.isChecked();
  await checkbox.click();
  expect(await checkbox.isChecked()).toBe(!checkedBefore);

  const zoomedBodyBox = await body.boundingBox();
  if (!zoomedBodyBox) {
    throw new Error('Card body lost its painted bounding box after zoom');
  }
  await page.mouse.move(zoomedBodyBox.x + 3, zoomedBodyBox.y + 6);
  await page.mouse.down();
  await page.mouse.move(
    zoomedBodyBox.x + Math.min(120, zoomedBodyBox.width - 8),
    zoomedBodyBox.y + 6,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  const selection = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selection.trim().length).toBeGreaterThan(3);

  const beforePan = await cardBox(page, 'card-001');
  const empty = await findEmptyPoint(page);
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x + 100, empty.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await cardBox(page, 'card-001')).x)
    .toBeGreaterThan(beforePan.x + 50);
  await expect(page.locator('canvas > .card[drawable]')).toHaveCount(216);
  expect(await welcome.evaluate((element, previous) => element === previous, welcomeHandle)).toBe(
    true,
  );

  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const accessibleNames = nodes.map((node) => node.name?.value ?? '').join(' ');
  expect(accessibleNames).toContain('The wall is real');
  expect(accessibleNames).toContain('Launch narrative');
  await cdp.detach();

  await viewportHasNoScrollbars(page);
  expect(consoleProblems.messages).toEqual([]);
});

test('honours an explicit DOM request even when canvas is available', async ({ page }) => {
  const consoleProblems = watchConsole(page);
  await page.goto('/?render=dom');
  await expectBoardReady(page, 'DOM');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(consoleProblems.messages).toEqual([]);
});

test('reports a canvas drawing failure and continues in DOM without losing cards', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'drawElementImage', {
      configurable: true,
      writable: true,
      value() {
        throw new Error('simulated canvas drawing failure');
      },
    });
  });

  const consoleProblems = watchConsole(page);
  await page.goto('/?render=canvas');
  await expectBoardReady(page, 'DOM');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(216);
  await expect(page.getByRole('status')).toContainText('switched to the DOM renderer');
  expect(consoleProblems.messages).toEqual([]);
});
