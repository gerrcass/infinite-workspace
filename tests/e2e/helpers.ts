import { expect, type Locator, type Page } from '@playwright/test';

export interface ConsoleProblems {
  readonly messages: string[];
}

export function watchConsole(page: Page): ConsoleProblems {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      messages.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    messages.push(String(error));
  });
  return { messages };
}

export function rendererBadge(page: Page): Locator {
  return page.locator('[data-testid="renderer-badge"]');
}

export function cardCount(page: Page): Locator {
  return page.locator('[data-testid="card-count"]');
}

export function zoomLevel(page: Page): Locator {
  return page.locator('[data-testid="zoom-level"]');
}

export function cards(page: Page): Locator {
  return page.locator('.card');
}

export function card(page: Page, id: string): Locator {
  return page.locator(`[data-card-id="${id}"]`);
}

export async function expectBoardReady(page: Page, mode: 'Canvas' | 'DOM'): Promise<void> {
  await expect(cards(page)).toHaveCount(216);
  await expect(rendererBadge(page)).toHaveText(mode);
  await expect(cardCount(page)).toHaveText('216 cards');
  await expect(zoomLevel(page)).toBeVisible();
}

export async function currentZoom(page: Page): Promise<number> {
  const text = (await zoomLevel(page).textContent()) ?? '0%';
  return Number.parseInt(text, 10);
}

export interface CardBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export async function cardBox(page: Page, id: string): Promise<CardBoundingBox> {
  const box = await card(page, id).boundingBox();
  if (!box) {
    throw new Error(`Card ${id} has no bounding box`);
  }
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * Find empty paper: no card, no chrome panel, no dialog, and still inside the
 * board. Scanning avoids hard-coded coordinates that drift with the seed.
 */
export async function findEmptyPoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const board = document.querySelector('.board');
    if (!board) {
      return null;
    }
    const rect = board.getBoundingClientRect();
    const step = 16;
    for (let y = rect.top + 60; y < rect.bottom - 60; y += step) {
      for (let x = rect.left + 60; x < rect.right - 60; x += step) {
        const stack = document.elementsFromPoint(x, y);
        const top = stack[0];
        if (!top) {
          continue;
        }
        if (stack.some((element) => element.closest('.card, .chrome, dialog'))) {
          continue;
        }
        if (!top.closest('.board')) {
          continue;
        }
        return { x, y };
      }
    }
    return null;
  });

  if (!point) {
    throw new Error('Could not find empty board paper for the drag');
  }
  return point;
}

export async function viewportHasNoScrollbars(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bodyScrollWidth: document.body.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
}

export async function expectNoOverlappingCards(page: Page): Promise<void> {
  const overlaps = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>('.card')];
    const boxes = nodes.map((node) => ({
      id: node.dataset.cardId ?? 'unknown',
      rect: node.getBoundingClientRect(),
    }));
    const found: string[] = [];

    for (let a = 0; a < boxes.length; a += 1) {
      const first = boxes[a];
      if (!first) {
        continue;
      }
      for (let b = a + 1; b < boxes.length; b += 1) {
        const second = boxes[b];
        if (!second) {
          continue;
        }
        const overlap =
          first.rect.left < second.rect.right &&
          first.rect.right > second.rect.left &&
          first.rect.top < second.rect.bottom &&
          first.rect.bottom > second.rect.top;
        if (overlap) {
          found.push(`${first.id} overlaps ${second.id}`);
        }
      }
    }

    return found.slice(0, 8);
  });

  expect(overlaps).toEqual([]);
}

export async function openBoard(page: Page, mode: 'Canvas' | 'DOM'): Promise<void> {
  await page.goto(mode === 'Canvas' ? '/?render=canvas' : '/?render=dom');
  await expectBoardReady(page, mode);
}

export async function pastePlainText(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, text);
}

/**
 * The editing journey shared by both renderers: focus at the clicked glyph,
 * plain-text editing, checklist controls, and the low-zoom assist.
 */
export async function runEditableCardsJourney(
  page: Page,
  mode: 'Canvas' | 'DOM',
  consoleProblems: ConsoleProblems,
): Promise<void> {
  await openBoard(page, mode);
  const welcome = card(page, 'card-000');
  const title = welcome.locator('.card__title');
  const body = welcome.locator('.card__body');
  const initialHeight = (await welcome.boundingBox())?.height ?? 0;

  await expect(title).toHaveAttribute('contenteditable', /plaintext-only|true/);
  await expect(body).toHaveAttribute('contenteditable', /plaintext-only|true/);

  await title.click();
  await expect(title).toBeFocused();
  await expect(welcome).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('A live working title');
  await expect(title).toHaveText('A live working title');

  await page.keyboard.press('Enter');
  await expect(title).not.toBeFocused();
  expect(await title.innerText()).not.toContain('\n');

  await body.click();
  await expect(body).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('First thought');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second thought');
  await expect(body).toContainText('First thought');
  await expect(body).toContainText('Second thought');
  expect(await body.innerText()).toContain('\n');

  await pastePlainText(page, body, 'Pasted line one\nPasted line two');
  await expect(body).toContainText('Pasted line one');
  await expect(body).toContainText('Pasted line two');

  const editedHeight = (await welcome.boundingBox())?.height ?? 0;
  await page.keyboard.press('Control+End');
  await page.keyboard.type(
    ' A longer closing line that has to wrap across several lines, which proves that the card height follows the real HTML content instead of a fixed box.',
  );
  await expect
    .poll(async () => (await welcome.boundingBox())?.height ?? 0)
    .toBeGreaterThan(editedHeight);
  expect(initialHeight).toBeGreaterThan(0);

  await title.click();
  await page.keyboard.press('Control+A');
  await pastePlainText(page, title, 'One line\nTwo line');
  await expect(title).toHaveText('One line Two line');

  const checkbox = welcome.locator('input[type="checkbox"]').first();
  const checkText = welcome.locator('.card__check-text').first();
  const checkedBefore = await checkbox.isChecked();
  await checkText.click();
  await expect(checkText).toBeFocused();
  expect(await checkbox.isChecked()).toBe(checkedBefore);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('A renamed checklist item');
  await expect(checkText).toHaveText('A renamed checklist item');
  await checkbox.click();
  expect(await checkbox.isChecked()).toBe(!checkedBefore);

  const checklistItems = welcome.locator('.card__check');
  const beforeAdd = await checklistItems.count();
  await welcome.locator('.card__add-check').click();
  await expect(checklistItems).toHaveCount(beforeAdd + 1);
  const newItem = checklistItems.last();
  const newText = newItem.locator('.card__check-text');
  await expect(newText).toBeFocused();
  await page.keyboard.type('Ship the editing slice');
  await expect(newText).toHaveText('Ship the editing slice');
  await newItem.locator('.card__check-remove').click();
  await expect(checklistItems).toHaveCount(beforeAdd);

  const empty = await findEmptyPoint(page);
  await page.mouse.click(empty.x, empty.y);
  await expect(welcome).toHaveAttribute('data-selected', 'false');
  expect(await checkbox.isChecked()).toBe(!checkedBefore);
  await expect(title).toHaveText('One line Two line');

  await page.getByRole('button', { name: 'Fit the whole board in the view' }).click();
  await expect.poll(() => currentZoom(page)).toBeLessThan(70);
  await title.click();
  await expect(title).toBeFocused();
  await expect.poll(() => currentZoom(page)).toBeGreaterThanOrEqual(85);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Reset to 100 percent/i }).click();
  await expect.poll(() => currentZoom(page)).toBe(100);
  await expect(title).toHaveText('One line Two line');
  await expect(checkbox).toBeChecked({ checked: !checkedBefore });

  expect(consoleProblems.messages).toEqual([]);
}

/** Fit should leave every card inside the viewport, not just zoom out. */
export async function expectAllCardsInViewport(page: Page): Promise<void> {
  const outside = await page.evaluate(() => {
    return [...document.querySelectorAll<HTMLElement>('.card')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.right < 0 ||
          rect.bottom < 0 ||
          rect.left > window.innerWidth ||
          rect.top > window.innerHeight
        );
      })
      .map((node) => node.dataset.cardId ?? 'unknown')
      .slice(0, 8);
  });

  expect(outside).toEqual([]);
}
