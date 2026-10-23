import { CARD_WIDTHS, type Board, type Card, type ChecklistItem } from './types';
import {
  CLUSTERS,
  GENERATED_BODIES,
  GENERATED_CHECKLISTS,
  WELCOME_COPY,
  type CardCopy,
  type ClusterSpec,
} from './seed-content';

export const SEED_CARD_COUNT = 216;
export const SEED_VERSION = 1;

const COLUMNS = 4;
const COLUMN_PITCH = 300;
const ROW_PITCH = 300;
const JITTER = 6;

export const WELCOME_ORIGIN = { x: 1210, y: 260 } as const;

function pick<T>(items: readonly T[], index: number): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty list');
  }
  const item = items[index % items.length];
  if (item === undefined) {
    throw new Error('Seed pick failed unexpectedly');
  }
  return item;
}

/** Deterministic PRNG so hand-placed jitter is stable across reloads and tests. */
function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCopy(spec: ClusterSpec, clusterIndex: number): CardCopy[] {
  const copies: CardCopy[] = [...spec.base];

  for (let index = 0; copies.length < spec.count; index += 1) {
    const topic = pick(spec.topics, index);
    const move = pick(spec.moves, index * 3 + spec.base.length);
    const body = pick(GENERATED_BODIES, index + clusterIndex);
    const checklist =
      index % 5 === 2 || index % 9 === 0
        ? pick(GENERATED_CHECKLISTS, index + clusterIndex)
        : undefined;

    copies.push({
      title: `${move} ${topic}`,
      body,
      ...(checklist ? { checklist } : {}),
    });
  }

  return copies.slice(0, spec.count);
}

function makeChecklist(
  cardId: string,
  labels: readonly string[] | undefined,
  seedIndex: number,
): ChecklistItem[] {
  if (!labels) {
    return [];
  }

  return labels.map((text, index) => ({
    id: `${cardId}-check-${index}`,
    text,
    done: (seedIndex + index) % 4 === 0,
  }));
}

function makeWelcomeCard(): Card {
  const id = 'card-000';
  return {
    id,
    x: WELCOME_ORIGIN.x,
    y: WELCOME_ORIGIN.y,
    width: 'wide',
    color: 'cream',
    tag: 'START HERE',
    title: WELCOME_COPY.title,
    body: WELCOME_COPY.body,
    checklist: makeChecklist(id, WELCOME_COPY.checklist, 1),
    z: SEED_CARD_COUNT,
  };
}

/**
 * The curated board. Reads as eight project neighbourhoods around a central
 * launch wall. Layout is a deterministic masonry-ish grid: four columns per
 * cluster, fixed row pitch, and small hand-placed jitter. Position does not
 * encode card height, so the renderer measures the real HTML.
 */
export function createSeed(): Board {
  const cards: Card[] = [makeWelcomeCard()];

  CLUSTERS.forEach((spec, clusterIndex) => {
    const random = mulberry32(0x9e3779b9 + clusterIndex * 101);
    const copies = buildCopy(spec, clusterIndex);

    copies.forEach((copy, index) => {
      const id = `card-${String(cards.length).padStart(3, '0')}`;
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const jitterX = (random() - 0.5) * JITTER * 2;
      const jitterY = (random() - 0.5) * JITTER * 2;

      cards.push({
        id,
        x: spec.originX + column * COLUMN_PITCH + jitterX,
        y: spec.originY + row * ROW_PITCH + jitterY,
        width: 'regular',
        color: pick(spec.palette, index + clusterIndex),
        tag: spec.tag,
        title: copy.title,
        body: copy.body,
        checklist: makeChecklist(id, copy.checklist, index + clusterIndex),
        z: cards.length + 1,
      });
    });
  });

  if (cards.length !== SEED_CARD_COUNT) {
    throw new Error(`Seed must contain ${SEED_CARD_COUNT} cards, received ${cards.length}`);
  }

  return {
    cards,
    selectedId: null,
    zCounter: SEED_CARD_COUNT,
  };
}

/**
 * Conservative height estimate used by layout tests. Deliberately rounds up:
 * the rendered card may be shorter, but overlapping seed cards are a bug even
 * before the DOM measures them.
 */
export function estimateCardHeight(
  card: Pick<Card, 'width' | 'title' | 'body' | 'checklist'>,
): number {
  const contentWidth = CARD_WIDTHS[card.width] - 34;
  const titleCharsPerLine = Math.max(10, Math.floor(contentWidth / 8));
  const bodyCharsPerLine = Math.max(12, Math.floor(contentWidth / 6.4));
  const titleLines = Math.max(1, Math.ceil(card.title.length / titleCharsPerLine));
  const bodyLines = card.body.length > 0 ? Math.ceil(card.body.length / bodyCharsPerLine) : 0;

  const paddingAndBorder = 36;
  const meta = 22;
  const title = titleLines * 19.5;
  const body = bodyLines > 0 ? 7 + bodyLines * 19.5 : 0;
  const checklist = card.checklist.length > 0 ? 9 + card.checklist.length * 24 : 0;

  return Math.ceil(paddingAndBorder + meta + title + body + checklist + 8);
}
