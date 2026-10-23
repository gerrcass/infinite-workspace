import type { WorldBounds } from '../camera/camera';
import { CARD_WIDTHS, type Card } from '../store/types';
import { createCardView, type CardView, type CardViewHandlers } from '../ui/card-view';

export interface CardLayerEntry {
  readonly card: Card;
  readonly element: HTMLElement;
}

interface StoredView {
  card: Card;
  readonly view: CardView;
}

export interface CardLayerOptions {
  readonly cardHandlers: CardViewHandlers;
  readonly onCardResize?: () => void;
  readonly decorate?: (element: HTMLElement) => void;
}

/**
 * Owns the card views for one renderer. The DOM layer and the canvas layer
 * share this so card content, measurement, and lifecycle cannot drift.
 */
export class CardLayer {
  private readonly views = new Map<string, StoredView>();
  private readonly resizeObserver: ResizeObserver | null;
  private selectedId: string | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly options: CardLayerOptions,
  ) {
    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            this.options.onCardResize?.();
          });
  }

  mount(cards: readonly Card[], selectedId: string | null): void {
    this.selectedId = selectedId;
    for (const card of cards) {
      this.create(card);
    }
    this.setSelection(selectedId);
  }

  sync(cards: readonly Card[], selectedId: string | null): void {
    const incoming = new Set(cards.map((card) => card.id));

    for (const [id, stored] of this.views) {
      if (!incoming.has(id)) {
        stored.view.destroy();
        this.resizeObserver?.unobserve(stored.view.element);
        this.views.delete(id);
      }
    }

    for (const card of cards) {
      const stored = this.views.get(card.id);
      if (!stored) {
        this.create(card);
      } else if (stored.card !== card) {
        stored.card = card;
        stored.view.update(card);
      }
    }

    this.setSelection(selectedId);
  }

  syncCard(card: Card): void {
    const stored = this.views.get(card.id);
    if (!stored) {
      this.create(card);
      this.setSelection(this.selectedId);
      return;
    }
    stored.card = card;
    stored.view.update(card);
  }

  setSelection(selectedId: string | null): void {
    this.selectedId = selectedId;
    for (const [id, stored] of this.views) {
      stored.view.setSelected(id === selectedId);
    }
  }

  getElement(id: string): HTMLElement | undefined {
    return this.views.get(id)?.view.element;
  }

  entries(): CardLayerEntry[] {
    return [...this.views.values()].map((stored) => ({
      card: stored.card,
      element: stored.view.element,
    }));
  }

  orderedByZ(): CardLayerEntry[] {
    return this.entries().sort((a, b) => a.card.z - b.card.z);
  }

  getWorldBounds(): WorldBounds | null {
    if (this.views.size === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const { card, element } of this.entries()) {
      const height = element.offsetHeight;
      minX = Math.min(minX, card.x);
      minY = Math.min(minY, card.y);
      maxX = Math.max(maxX, card.x + CARD_WIDTHS[card.width]);
      maxY = Math.max(maxY, card.y + Math.max(1, height));
    }

    return { minX, minY, maxX, maxY };
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    for (const stored of this.views.values()) {
      stored.view.destroy();
    }
    this.views.clear();
  }

  private create(card: Card): void {
    const view = createCardView(card, this.options.cardHandlers);
    this.options.decorate?.(view.element);
    this.views.set(card.id, { card, view });
    this.parent.append(view.element);
    this.resizeObserver?.observe(view.element);
  }
}
