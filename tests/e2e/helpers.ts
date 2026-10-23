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
  await expect(title).toHaveAttribute('aria-label', 'Card title');
  await expect(body).toHaveAttribute('aria-label', 'Card body');

  const titleBox = await title.boundingBox();
  if (!titleBox) {
    throw new Error('Card title has no box');
  }
  await title.click({ position: { x: titleBox.width * 0.65, y: titleBox.height / 2 } });
  await expect(title).toBeFocused();
  await expect(welcome).toHaveAttribute('data-selected', 'true');
  expect(await page.evaluate(() => window.getSelection()?.anchorOffset ?? 0)).toBeGreaterThan(0);
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
  await page.keyboard.press('Control+z');
  expect(await checkbox.isChecked()).toBe(checkedBefore);
  await page.keyboard.press('Control+Shift+z');
  expect(await checkbox.isChecked()).toBe(!checkedBefore);

  const checklistItems = welcome.locator('.card__check');
  const beforeAdd = await checklistItems.count();
  const addCheck = welcome.locator('.card__add-check');
  await welcome.focus();
  await page.keyboard.press('Tab');
  await expect(addCheck).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(checklistItems).toHaveCount(beforeAdd + 1);
  const newItem = checklistItems.last();
  const newText = newItem.locator('.card__check-text');
  await expect(newText).toBeFocused();
  await page.keyboard.type('Ship the editing slice');
  await expect(newText).toHaveText('Ship the editing slice');
  const removeNewItem = newItem.locator('.card__check-remove');
  await removeNewItem.focus();
  await page.keyboard.press('Enter');
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

export function selectedCard(page: Page): Locator {
  return page.locator('.card[data-selected="true"]');
}

export function selectionToolbar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Selected card actions' });
}

/**
 * The board-manipulation journey shared by both renderers: add, duplicate,
 * drag, colour, delete, undo/redo, persistence, reset, and clear.
 */
export async function runBoardManipulationJourney(
  page: Page,
  mode: 'Canvas' | 'DOM',
  consoleProblems: ConsoleProblems,
): Promise<void> {
  await openBoard(page, mode);
  const welcome = card(page, 'card-000');
  const welcomeTitle = welcome.locator('.card__title');
  const originalWelcomeTitle = await welcomeTitle.innerText();

  const spaceStart = await welcome.boundingBox();
  if (!spaceStart) {
    throw new Error('Welcome card has no box for Space-drag');
  }
  const beforeSpacePan = await cardBox(page, 'card-000');
  await page.keyboard.down('Space');
  await page.mouse.move(spaceStart.x + 40, spaceStart.y + 40);
  await page.mouse.down();
  await page.mouse.move(spaceStart.x + 120, spaceStart.y + 90, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect
    .poll(async () => (await cardBox(page, 'card-000')).x)
    .toBeGreaterThan(beforeSpacePan.x + 60);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');

  await page.keyboard.press('n');
  await expect(cards(page)).toHaveCount(217);
  await expect(selectedCard(page)).toHaveCount(1);
  const addedTitle = selectedCard(page).locator('.card__title');
  await expect(addedTitle).toBeFocused();
  await page.keyboard.type('Board manipulation note');
  await expect(addedTitle).toHaveText('Board manipulation note');
  await page.keyboard.press('Enter');
  await expect(addedTitle).not.toBeFocused();
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeEnabled();

  const addedBody = selectedCard(page).locator('.card__body');
  await expect(addedBody).toHaveAttribute('data-empty', 'true');
  await addedBody.click();
  await expect(addedBody).toBeFocused();
  await page.keyboard.type('Follow-up detail');
  await expect(addedBody).toHaveText('Follow-up detail');
  await page.keyboard.press('Escape');
  await expect(addedBody).not.toBeFocused();

  const firstId = await selectedCard(page).getAttribute('data-card-id');
  if (!firstId) {
    throw new Error('Added card has no id');
  }
  const firstBox = await cardBox(page, firstId);

  await page.keyboard.press('Control+d');
  await expect(cards(page)).toHaveCount(218);
  const copyId = await selectedCard(page).getAttribute('data-card-id');
  if (!copyId || copyId === firstId) {
    throw new Error('Duplicate did not select a new card');
  }
  await expect(selectedCard(page).locator('.card__title')).toHaveText('Board manipulation note');
  const copyBox = await cardBox(page, copyId);
  expect(copyBox.x).toBeGreaterThan(firstBox.x + 10);
  expect(copyBox.y).toBeGreaterThan(firstBox.y + 10);

  const toolbar = selectionToolbar(page);
  await expect(toolbar).toBeVisible();
  const toolbarBox = await toolbar.boundingBox();
  expect(toolbarBox).not.toBeNull();
  if (toolbarBox) {
    expect(toolbarBox.x).toBeGreaterThanOrEqual(0);
    expect(toolbarBox.y).toBeGreaterThanOrEqual(0);
    expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(1440);
    expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(900);
    expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(copyBox.y + 1);
  }

  const strip = selectedCard(page).locator('[data-drag-strip]');
  const stripBox = await strip.boundingBox();
  if (!stripBox) {
    throw new Error('Drag strip has no box');
  }
  const beforeDrag = await cardBox(page, copyId);
  await page.mouse.move(stripBox.x + stripBox.width / 2, stripBox.y + stripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    stripBox.x + stripBox.width / 2 + 140,
    stripBox.y + stripBox.height / 2 + 90,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await cardBox(page, copyId)).x)
    .toBeGreaterThan(beforeDrag.x + 100);
  await expect(selectedCard(page)).toHaveAttribute('data-card-id', copyId);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');

  const draggedBox = await cardBox(page, copyId);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await cardBox(page, copyId)).x).toBeLessThan(draggedBox.x - 60);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await cardBox(page, copyId)).x).toBeGreaterThan(draggedBox.x - 4);

  await page.getByRole('button', { name: 'Mint card color' }).click();
  await expect(selectedCard(page)).toHaveAttribute('data-color', 'mint');

  const toolbarDuplicate = page.getByRole('button', { name: 'Duplicate selected card' });
  await toolbarDuplicate.focus();
  await page.keyboard.press('Enter');
  await expect(cards(page)).toHaveCount(219);
  await expect(selectedCard(page)).not.toHaveAttribute('data-card-id', copyId);
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(218);
  await expect(selectedCard(page)).toHaveAttribute('data-card-id', copyId);

  await selectedCard(page).focus();
  await page.keyboard.press('Delete');
  await expect(cards(page)).toHaveCount(217);
  await expect(selectedCard(page)).toHaveCount(0);

  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(218);
  await expect(selectedCard(page)).toHaveAttribute('data-card-id', copyId);
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeEnabled();
  await page.keyboard.press('Control+Shift+z');
  await expect(cards(page)).toHaveCount(217);
  await expect(page.getByRole('button', { name: /^Redo/ })).toBeDisabled();

  const title = welcome.locator('.card__title');
  await title.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Typed session');
  await expect(title).toHaveText('Typed session');
  await page.keyboard.press('Escape');
  await expect(title).not.toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(title).toHaveText(originalWelcomeTitle);
  await page.keyboard.press('Control+Shift+z');
  await expect(title).toHaveText('Typed session');

  await page.keyboard.press('n');
  await expect(cards(page)).toHaveCount(218);
  await page.keyboard.type('Persisted note');
  await page.keyboard.press('Enter');
  await page.keyboard.press('1');
  await expect.poll(() => currentZoom(page)).toBe(100);
  await page.keyboard.press('+');
  await expect.poll(() => currentZoom(page)).toBe(120);

  const persisted = page.locator('.card').filter({ hasText: 'Persisted note' });
  await expect(persisted).toHaveCount(1);
  const persistedId = await persisted.getAttribute('data-card-id');
  if (!persistedId) {
    throw new Error('Persisted card has no id');
  }

  const beforeArrowPan = await cardBox(page, persistedId);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(async () => (await cardBox(page, persistedId)).x)
    .toBeLessThan(beforeArrowPan.x - 50);
  await expect
    .poll(async () => (await cardBox(page, persistedId)).y)
    .toBeLessThan(beforeArrowPan.y - 50);

  const persistedStrip = card(page, persistedId).locator('[data-drag-strip]');
  const persistedStripBox = await persistedStrip.boundingBox();
  if (!persistedStripBox) {
    throw new Error('Persisted card drag strip has no box');
  }
  const beforePersistedDrag = await cardBox(page, persistedId);
  await page.mouse.move(
    persistedStripBox.x + persistedStripBox.width / 2,
    persistedStripBox.y + persistedStripBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    persistedStripBox.x + persistedStripBox.width / 2 + 70,
    persistedStripBox.y + persistedStripBox.height / 2 + 50,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await cardBox(page, persistedId)).x)
    .toBeGreaterThan(beforePersistedDrag.x + 50);

  const persistedBox = await cardBox(page, persistedId);
  await expect(page.locator('.status__save-text')).toHaveText('Saved', { timeout: 5_000 });

  await page.reload();
  await expect(cards(page)).toHaveCount(218);
  await expect(rendererBadge(page)).toHaveText(mode);
  await expect(page.locator('.status__save-text')).toHaveText('Saved');
  await expect.poll(() => currentZoom(page)).toBe(120);
  await expect(card(page, persistedId).locator('.card__title')).toHaveText('Persisted note');
  await expect(selectedCard(page)).toHaveCount(0);
  await expect
    .poll(async () => Math.abs((await cardBox(page, persistedId)).x - persistedBox.x))
    .toBeLessThan(3);
  await expect
    .poll(async () => Math.abs((await cardBox(page, persistedId)).y - persistedBox.y))
    .toBeLessThan(3);

  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByText('Reset the demo?')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm reset demo' }).click();
  await expect(dialog).toBeHidden();
  await expect(cards(page)).toHaveCount(216);
  await expect(card(page, 'card-000').locator('.card__title')).toHaveText(originalWelcomeTitle);
  expect(await currentZoom(page)).not.toBe(120);
  await expect(page.locator('.status__save-text')).toHaveText('Saved', { timeout: 5_000 });

  await page.reload();
  await expect(cards(page)).toHaveCount(216);
  await expect(card(page, 'card-000').locator('.card__title')).toHaveText(originalWelcomeTitle);
  await expect(selectionToolbar(page)).toBeHidden();

  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Clear saved data', exact: true }).click();
  await expect(page.getByText('Clear the saved board from this browser?')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm clear saved data' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.status__save-text')).toHaveText('Session only');
  const stored = await page.evaluate(() => localStorage.getItem('infinite-workspace:board:v1'));
  expect(stored).toBeNull();

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
