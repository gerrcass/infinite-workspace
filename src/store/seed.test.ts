import { describe, expect, it } from 'vitest';
import { createSeed, estimateCardHeight, SEED_CARD_COUNT } from './seed';
import { CARD_WIDTHS, cardPlainText } from './types';

function boxesOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

describe('seed', () => {
  it('contains exactly 216 deterministic cards', () => {
    const first = createSeed();
    const second = createSeed();
    expect(first.cards).toHaveLength(SEED_CARD_COUNT);
    expect(first.cards).toEqual(second.cards);
  });

  it('gives every card a unique id and finite coordinates', () => {
    const { cards } = createSeed();
    const ids = new Set(cards.map((card) => card.id));
    expect(ids.size).toBe(SEED_CARD_COUNT);

    for (const card of cards) {
      expect(card.id).toMatch(/^card-\d{3}$/);
      expect(Number.isFinite(card.x)).toBe(true);
      expect(Number.isFinite(card.y)).toBe(true);
      expect(Number.isFinite(card.z)).toBe(true);
      expect(card.width in CARD_WIDTHS).toBe(true);
      expect(card.title.length).toBeGreaterThan(3);
      expect(card.body.length).toBeGreaterThan(10);
    }
  });

  it('lays the opening board out without overlapping cards', () => {
    const { cards } = createSeed();
    for (let a = 0; a < cards.length; a += 1) {
      const cardA = cards[a];
      if (!cardA) {
        continue;
      }
      const widthA = CARD_WIDTHS[cardA.width];
      const heightA = estimateCardHeight(cardA);
      for (let b = a + 1; b < cards.length; b += 1) {
        const cardB = cards[b];
        if (!cardB) {
          continue;
        }
        const widthB = CARD_WIDTHS[cardB.width];
        const heightB = estimateCardHeight(cardB);
        expect(
          boxesOverlap(cardA.x, cardA.y, widthA, heightA, cardB.x, cardB.y, widthB, heightB),
          `${cardA.title} overlaps ${cardB.title}`,
        ).toBe(false);
      }
    }
  });

  it('has varied colours, tags, and real checklists', () => {
    const { cards } = createSeed();
    expect(new Set(cards.map((card) => card.color)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(cards.map((card) => card.tag))).toEqual(
      new Set([
        'START HERE',
        'LAUNCH',
        'RESEARCH',
        'DESIGN',
        'QUESTIONS',
        'BUILD',
        'METRICS',
        'OPS',
        'LATER',
      ]),
    );
    expect(cards.filter((card) => card.checklist.length > 0).length).toBeGreaterThan(30);
    expect(cards.flatMap((card) => card.checklist).every((item) => item.id.length > 0)).toBe(true);
  });

  it('plants the word needle in more than one place for native find', () => {
    const { cards } = createSeed();
    const matches = cards.filter((card) => cardPlainText(card).toLowerCase().includes('needle'));
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the welcome card on top and off the cluster grid', () => {
    const { cards } = createSeed();
    const welcome = cards.find((card) => card.tag === 'START HERE');
    expect(welcome).toBeDefined();
    expect(welcome?.width).toBe('wide');
    expect(welcome?.z).toBe(Math.max(...cards.map((card) => card.z)));
  });
});
