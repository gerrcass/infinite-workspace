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
