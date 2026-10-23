import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  card,
  cardBox,
  cards,
  currentZoom,
  expectBoardReady,
  findEmptyPoint,
  runBoardManipulationJourney,
  runEditableCardsJourney,
  runFindHintJourney,
  runNativeFindJourney,
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

test('edits live card text and checklists through canvas hit-testing', async ({ page }) => {
  const consoleProblems = watchConsole(page);
  await runEditableCardsJourney(page, 'Canvas', consoleProblems);
});

test('adds, drags, duplicates, undoes, persists, and resets in canvas', async ({ page }) => {
  const consoleProblems = watchConsole(page);
  await runBoardManipulationJourney(page, 'Canvas', consoleProblems);
});

test('keeps edits and checkbox state when canvas fails over to DOM', async ({ page }) => {
  await page.addInitScript(() => {
    interface DrawableContext extends CanvasRenderingContext2D {
      drawElementImage(
        element: Element,
        dx: number,
        dy: number,
        width?: number,
        height?: number,
      ): void;
    }
    const testWindow = window as Window & { __failDraw?: boolean };
    testWindow.__failDraw = false;
    const prototype = CanvasRenderingContext2D.prototype as DrawableContext;
    const original = prototype.drawElementImage;
    Object.defineProperty(prototype, 'drawElementImage', {
      configurable: true,
      writable: true,
      value(this: DrawableContext, ...args: Parameters<typeof original>) {
        if (testWindow.__failDraw) {
          throw new Error('simulated canvas drawing failure');
        }
        original.apply(this, args);
      },
    });
  });

  const consoleProblems = watchConsole(page);
  await page.goto('/?render=canvas');
  await expectBoardReady(page, 'Canvas');

  const welcome = card(page, 'card-000');
  const title = welcome.locator('.card__title');
  await title.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Survives the switch');
  await page.keyboard.press('Enter');

  const checkbox = welcome.locator('input[type="checkbox"]').first();
  const checkedBefore = await checkbox.isChecked();
  await checkbox.click();
  expect(await checkbox.isChecked()).toBe(!checkedBefore);

  await page.evaluate(() => {
    (window as Window & { __failDraw?: boolean }).__failDraw = true;
  });
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expectBoardReady(page, 'DOM');
  await expect(card(page, 'card-000').locator('.card__title')).toHaveText('Survives the switch');
  await expect(card(page, 'card-000').locator('input[type="checkbox"]').first()).toBeChecked({
    checked: !checkedBefore,
  });
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

test('reveals a selected find match inside a live card', async ({ page }) => {
  const consoleProblems = watchConsole(page);
  await runNativeFindJourney(page, 'Canvas', consoleProblems);
});

test('shows and remembers the native-find hint', async ({ page }) => {
  await runFindHintJourney(page, 'Canvas');
});

test('keeps canvas paint work inside the performance budget while panning', async ({ page }) => {
  await page.goto('/?render=canvas&perf=1');
  await expectBoardReady(page, 'Canvas');
  const start = await findEmptyPoint(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 24; step += 1) {
    await page.mouse.move(start.x - step * 18, start.y - step * 5);
  }
  await page.mouse.up();
  await page.waitForTimeout(350);

  const perf = await page.evaluate(() => {
    const api = window as unknown as {
      __infiniteWorkspacePerf?: () => {
        frames: number;
        totalPaintMs: number;
        lastPaintMs: number;
        drawCount: number;
      } | null;
    };
    return api.__infiniteWorkspacePerf?.() ?? null;
  });

  expect(perf).not.toBeNull();
  expect(perf!.frames).toBeGreaterThan(8);
  expect(perf!.drawCount).toBe(216);
  const average = perf!.totalPaintMs / perf!.frames;
  console.log(`canvas paint average: ${average.toFixed(2)} ms over ${perf!.frames} frames`);
  expect(average).toBeLessThan(16);
});

test('pinch zooms around the gesture midpoint', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  const consoleProblems = watchConsole(page);
  const baseURL = test.info().project.use.baseURL ?? 'http://127.0.0.1:4173';
  await page.goto(`${baseURL}/?render=canvas`);
  await expectBoardReady(page, 'Canvas');
  const hint = page.locator('[data-testid="find-hint"]');
  if (await hint.isVisible().catch(() => false)) {
    await hint.getByRole('button', { name: 'Dismiss find tip' }).click();
  }
  const before = await currentZoom(page);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 500, y: 650, id: 1 },
      { x: 700, y: 650, id: 2 },
    ],
  });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: 440, y: 650, id: 1 },
      { x: 760, y: 650, id: 2 },
    ],
  });
  await expect.poll(async () => currentZoom(page)).toBeGreaterThan(before);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  expect(consoleProblems.messages).toEqual([]);
  await context.close();
});
