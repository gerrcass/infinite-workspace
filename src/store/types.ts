export const CARD_COLORS = ['cream', 'butter', 'rose', 'mint', 'sky', 'lilac', 'peach'] as const;

export type CardColor = (typeof CARD_COLORS)[number];

export const CARD_WIDTHS = {
  narrow: 230,
  regular: 260,
  wide: 380,
} as const;

export type CardWidth = keyof typeof CARD_WIDTHS;

export interface ChecklistItem {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
}

export interface Card {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: CardWidth;
  readonly color: CardColor;
  readonly tag: string;
  readonly title: string;
  readonly body: string;
  readonly checklist: readonly ChecklistItem[];
  readonly z: number;
}

export interface Board {
  readonly cards: readonly Card[];
  readonly selectedId: string | null;
  readonly zCounter: number;
}

export function cardWidth(card: Pick<Card, 'width'>): number {
  return CARD_WIDTHS[card.width];
}

export function isCardColor(value: string): value is CardColor {
  return (CARD_COLORS as readonly string[]).includes(value);
}

/** All user-visible text on a card, handy for find-related checks and tests. */
export function cardPlainText(card: Card): string {
  return [card.title, card.body, ...card.checklist.map((item) => item.text)].join(' ');
}
