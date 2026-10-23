import type { Camera } from '../camera/camera';
import { clampZoom, isFiniteCamera } from '../camera/camera';
import type { Board, Card, ChecklistItem } from './types';

export type StoreEvent =
  | { readonly type: 'camera'; readonly camera: Camera }
  | { readonly type: 'cards'; readonly cards: readonly Card[] }
  | { readonly type: 'card'; readonly card: Card }
  | { readonly type: 'selection'; readonly selectedId: string | null };

export type StoreListener = (event: StoreEvent) => void;

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createChecklistItemId(cardId: string, checklist: readonly ChecklistItem[]): string {
  const existing = new Set(checklist.map((item) => item.id));
  let id = `${cardId}-check-${randomToken()}`;
  while (existing.has(id)) {
    id = `${cardId}-check-${randomToken()}`;
  }
  return id;
}

export interface StoreSnapshot {
  readonly cards: readonly Card[];
  readonly selectedId: string | null;
  readonly camera: Camera;
  readonly zCounter: number;
}

/**
 * The single source of truth for board data, selection, and camera. It has no
 * DOM knowledge. Mutations notify targeted subscribers so the app can update
 * the affected card without rebuilding the wall.
 */
export class BoardStore {
  private cards: Card[];
  private selectedId: string | null;
  private camera: Camera;
  private zCounter: number;
  private readonly listeners = new Set<StoreListener>();

  constructor(board: Board, camera: Camera) {
    this.cards = [...board.cards];
    this.selectedId = board.selectedId;
    this.camera = camera;
    this.zCounter = board.zCounter;
  }

  getSnapshot(): StoreSnapshot {
    return {
      cards: this.cards,
      selectedId: this.selectedId,
      camera: this.camera,
      zCounter: this.zCounter,
    };
  }

  getCards(): readonly Card[] {
    return this.cards;
  }

  getCard(id: string): Card | undefined {
    return this.cards.find((card) => card.id === id);
  }

  getCamera(): Camera {
    return this.camera;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setCamera(camera: Camera): void {
    if (!isFiniteCamera(camera)) {
      return;
    }

    const next = { ...camera, zoom: clampZoom(camera.zoom) };
    if (next.x === this.camera.x && next.y === this.camera.y && next.zoom === this.camera.zoom) {
      return;
    }

    this.camera = next;
    this.emit({ type: 'camera', camera: next });
  }

  select(selectedId: string | null): void {
    if (selectedId !== null && !this.cards.some((card) => card.id === selectedId)) {
      return;
    }
    if (selectedId === this.selectedId) {
      return;
    }

    this.selectedId = selectedId;
    this.emit({ type: 'selection', selectedId });
  }

  addCard(card: Card): void {
    if (this.cards.some((existing) => existing.id === card.id)) {
      throw new Error(`Card ${card.id} already exists`);
    }

    this.cards = [...this.cards, card];
    this.zCounter = Math.max(this.zCounter, card.z);
    this.emit({ type: 'cards', cards: this.cards });
  }

  updateCardText(id: string, field: 'title' | 'body', text: string): Card | null {
    const current = this.getCard(id);
    if (!current || current[field] === text) {
      return current ?? null;
    }
    return this.updateCard(id, field === 'title' ? { title: text } : { body: text });
  }

  updateChecklistItemText(cardId: string, itemId: string, text: string): Card | null {
    const current = this.getCard(cardId);
    if (!current) {
      return null;
    }
    const item = current.checklist.find((entry) => entry.id === itemId);
    if (!item || item.text === text) {
      return current;
    }
    return this.updateChecklist(cardId, (checklist) =>
      checklist.map((entry) => (entry.id === itemId ? { ...entry, text } : entry)),
    );
  }

  toggleChecklistItem(cardId: string, itemId: string, done?: boolean): Card | null {
    const current = this.getCard(cardId);
    const item = current?.checklist.find((entry) => entry.id === itemId);
    if (!current || !item) {
      return current ?? null;
    }
    const nextDone = done ?? !item.done;
    if (item.done === nextDone) {
      return current;
    }
    return this.updateChecklist(cardId, (checklist) =>
      checklist.map((entry) => (entry.id === itemId ? { ...entry, done: nextDone } : entry)),
    );
  }

  addChecklistItem(cardId: string, text = ''): ChecklistItem | null {
    const current = this.getCard(cardId);
    if (!current) {
      return null;
    }
    const item: ChecklistItem = {
      id: createChecklistItemId(cardId, current.checklist),
      text,
      done: false,
    };
    const next = this.updateChecklist(cardId, (checklist) => [...checklist, item]);
    return next ? item : null;
  }

  removeChecklistItem(cardId: string, itemId: string): Card | null {
    const current = this.getCard(cardId);
    if (!current || !current.checklist.some((entry) => entry.id === itemId)) {
      return current ?? null;
    }
    return this.updateChecklist(cardId, (checklist) =>
      checklist.filter((entry) => entry.id !== itemId),
    );
  }

  updateCard(id: string, patch: Partial<Omit<Card, 'id'>>): Card | null {
    const index = this.cards.findIndex((card) => card.id === id);
    const current = this.cards[index];
    if (index < 0 || !current) {
      return null;
    }

    const next: Card = { ...current, ...patch };
    const cards = [...this.cards];
    cards[index] = next;
    this.cards = cards;
    this.zCounter = Math.max(this.zCounter, next.z);
    this.emit({ type: 'card', card: next });
    return next;
  }

  removeCard(id: string): void {
    const index = this.cards.findIndex((card) => card.id === id);
    if (index < 0) {
      return;
    }

    this.cards = [...this.cards.slice(0, index), ...this.cards.slice(index + 1)];
    if (this.selectedId === id) {
      this.selectedId = null;
      this.emit({ type: 'selection', selectedId: null });
    }
    this.emit({ type: 'cards', cards: this.cards });
  }

  private updateChecklist(
    cardId: string,
    transform: (checklist: readonly ChecklistItem[]) => ChecklistItem[],
  ): Card | null {
    const current = this.getCard(cardId);
    if (!current) {
      return null;
    }
    return this.updateCard(cardId, { checklist: transform(current.checklist) });
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
