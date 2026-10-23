import type { Camera } from '../camera/camera';
import { cameraEquals, clampZoom, isFiniteCamera } from '../camera/camera';
import type { Board, Card, CardColor, ChecklistItem } from './types';

export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type StoreEvent =
  | { readonly type: 'camera'; readonly camera: Camera }
  | { readonly type: 'cards'; readonly cards: readonly Card[] }
  | { readonly type: 'card'; readonly card: Card }
  | { readonly type: 'selection'; readonly selectedId: string | null }
  | { readonly type: 'history'; readonly state: HistoryState };

export type StoreListener = (event: StoreEvent) => void;

export interface StoreOptions {
  readonly historyLimit?: number;
  readonly createId?: () => string;
}

export interface StoreSnapshot {
  readonly cards: readonly Card[];
  readonly selectedId: string | null;
  readonly camera: Camera;
  readonly zCounter: number;
}

interface BoardSnapshot {
  readonly cards: readonly Card[];
  readonly selectedId: string | null;
  readonly zCounter: number;
}

const DEFAULT_HISTORY_LIMIT = 50;

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultCardId(): string {
  return `note-${randomToken()}`;
}

function createChecklistItemId(cardId: string, checklist: readonly ChecklistItem[]): string {
  const existing = new Set(checklist.map((item) => item.id));
  let id = `${cardId}-check-${randomToken()}`;
  while (existing.has(id)) {
    id = `${cardId}-check-${randomToken()}`;
  }
  return id;
}

/**
 * The single source of truth for board data, selection, camera, and history.
 * It has no DOM knowledge. Mutations notify targeted subscribers so the app can
 * update the affected card without rebuilding the wall.
 *
 * History is snapshot based. Structural actions push one entry; text edits
 * coalesce between `beginTextSession()` and `endTextSession()` so a whole field
 * session undoes at once. Native text undo remains the browser's job.
 */
export class BoardStore {
  private cards: Card[];
  private selectedId: string | null;
  private camera: Camera;
  private zCounter: number;
  private readonly listeners = new Set<StoreListener>();
  private undoStack: BoardSnapshot[] = [];
  private redoStack: BoardSnapshot[] = [];
  private textBaseline: BoardSnapshot | null = null;
  private moveBaseline: BoardSnapshot | null = null;
  private readonly historyLimit: number;
  private readonly createId: () => string;

  constructor(board: Board, camera: Camera, options: StoreOptions = {}) {
    this.cards = [...board.cards];
    this.selectedId = board.selectedId;
    this.camera = camera;
    this.zCounter = board.zCounter;
    this.historyLimit = Math.max(1, options.historyLimit ?? DEFAULT_HISTORY_LIMIT);
    this.createId = options.createId ?? defaultCardId;
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

  getHistoryState(): HistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
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

    this.structural(() => {
      this.cards = [...this.cards, card];
      this.zCounter = Math.max(this.zCounter, card.z);
      this.emit({ type: 'cards', cards: this.cards });
    });
  }

  duplicateCard(id: string): Card | null {
    const original = this.getCard(id);
    if (!original) {
      return null;
    }

    const newId = this.createId();
    if (this.cards.some((card) => card.id === newId)) {
      return null;
    }

    const copy: Card = {
      ...original,
      id: newId,
      x: original.x + 28,
      y: original.y + 28,
      z: this.zCounter + 1,
      checklist: original.checklist.map((item, index) => ({
        ...item,
        id: `${newId}-check-${index}`,
      })),
    };

    this.structural(() => {
      this.cards = [...this.cards, copy];
      this.zCounter = copy.z;
      this.selectedId = copy.id;
      this.emit({ type: 'cards', cards: this.cards });
      this.emit({ type: 'selection', selectedId: copy.id });
    });
    return copy;
  }

  removeCard(id: string): void {
    if (!this.cards.some((card) => card.id === id)) {
      return;
    }

    this.structural(() => {
      this.cards = this.cards.filter((card) => card.id !== id);
      if (this.selectedId === id) {
        this.selectedId = null;
        this.emit({ type: 'selection', selectedId: null });
      }
      this.emit({ type: 'cards', cards: this.cards });
    });
  }

  setCardColor(id: string, color: CardColor): Card | null {
    const current = this.getCard(id);
    if (!current || current.color === color) {
      return current ?? null;
    }
    return this.structuralUpdate(id, { color });
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
    return this.structuralUpdate(cardId, {
      checklist: current.checklist.map((entry) =>
        entry.id === itemId ? { ...entry, done: nextDone } : entry,
      ),
    });
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
    const next = this.structuralUpdate(cardId, {
      checklist: [...current.checklist, item],
    });
    return next ? item : null;
  }

  removeChecklistItem(cardId: string, itemId: string): Card | null {
    const current = this.getCard(cardId);
    if (!current || !current.checklist.some((entry) => entry.id === itemId)) {
      return current ?? null;
    }
    return this.structuralUpdate(cardId, {
      checklist: current.checklist.filter((entry) => entry.id !== itemId),
    });
  }

  /** Capture the pre-edit board once. Repeated calls in a session are no-ops. */
  beginTextSession(): void {
    if (this.textBaseline || this.moveBaseline) {
      return;
    }
    this.textBaseline = this.snapshot();
  }

  /**
   * Close a text session. If the field actually changed, the whole session
   * becomes one history entry; empty sessions disappear.
   */
  endTextSession(): void {
    const baseline = this.textBaseline;
    if (!baseline) {
      return;
    }
    this.textBaseline = null;
    if (this.hasBoardChanged(baseline)) {
      this.pushUndo(baseline);
    }
  }

  /** Start a pointer drag: select, raise, and remember the pre-drag board. */
  beginMoveSession(id: string): Card | null {
    this.endTextSession();
    if (this.moveBaseline) {
      this.endMoveSession(true);
    }
    const card = this.getCard(id);
    if (!card) {
      return null;
    }

    this.moveBaseline = this.snapshot();
    this.select(id);
    this.bringToFront(id);
    return this.getCard(id) ?? card;
  }

  moveCard(id: string, x: number, y: number): Card | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    const current = this.getCard(id);
    if (!current || (current.x === x && current.y === y)) {
      return current ?? null;
    }
    return this.updateCard(id, { x, y });
  }

  /** Close a drag. A real move becomes one history entry; a click does not. */
  endMoveSession(moved: boolean): void {
    const baseline = this.moveBaseline;
    if (!baseline) {
      return;
    }
    this.moveBaseline = null;
    if (moved && this.hasBoardChanged(baseline)) {
      this.pushUndo(baseline);
    }
  }

  undo(): boolean {
    if (this.textBaseline || this.moveBaseline) {
      return false;
    }
    const previous = this.undoStack.pop();
    if (!previous) {
      return false;
    }
    this.redoStack.push(this.snapshot());
    this.trimHistory();
    this.restore(previous);
    return true;
  }

  redo(): boolean {
    if (this.textBaseline || this.moveBaseline) {
      return false;
    }
    const next = this.redoStack.pop();
    if (!next) {
      return false;
    }
    this.undoStack.push(this.snapshot());
    this.trimHistory();
    this.restore(next);
    return true;
  }

  /**
   * Replace the board wholesale (reset demo, clear saved data). History is not
   * carried across a reset.
   */
  resetBoard(board: Board, camera: Camera): void {
    this.textBaseline = null;
    this.moveBaseline = null;
    this.undoStack = [];
    this.redoStack = [];
    this.cards = [...board.cards];
    this.zCounter = Math.max(board.zCounter, ...board.cards.map((card) => card.z), 0);
    this.selectedId =
      board.selectedId && board.cards.some((card) => card.id === board.selectedId)
        ? board.selectedId
        : null;

    const nextCamera = isFiniteCamera(camera)
      ? { ...camera, zoom: clampZoom(camera.zoom) }
      : camera;
    const cameraChanged = !cameraEquals(nextCamera, this.camera);
    if (cameraChanged) {
      this.camera = nextCamera;
      this.emit({ type: 'camera', camera: nextCamera });
    }
    this.emit({ type: 'cards', cards: this.cards });
    this.emit({ type: 'selection', selectedId: this.selectedId });
    this.emitHistory();
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

  private structuralUpdate(id: string, patch: Partial<Omit<Card, 'id'>>): Card | null {
    let updated: Card | null = null;
    this.structural(() => {
      updated = this.updateCard(id, patch);
    });
    return updated;
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

  private structural(mutate: () => void): void {
    this.endTextSession();
    const before = this.snapshot();
    mutate();
    if (this.hasBoardChanged(before)) {
      this.pushUndo(before);
    }
  }

  private bringToFront(id: string): void {
    const card = this.getCard(id);
    if (!card || card.z === this.zCounter) {
      return;
    }
    this.updateCard(id, { z: this.zCounter + 1 });
  }

  private snapshot(): BoardSnapshot {
    return {
      cards: this.cards,
      selectedId: this.selectedId,
      zCounter: this.zCounter,
    };
  }

  private hasBoardChanged(before: BoardSnapshot): boolean {
    return this.cards !== before.cards || this.zCounter !== before.zCounter;
  }

  private pushUndo(baseline: BoardSnapshot): void {
    this.undoStack.push(baseline);
    this.trimHistory();
    this.redoStack = [];
    this.emitHistory();
  }

  private trimHistory(): void {
    while (this.undoStack.length > this.historyLimit) {
      this.undoStack.shift();
    }
    while (this.redoStack.length > this.historyLimit) {
      this.redoStack.shift();
    }
  }

  private restore(snapshot: BoardSnapshot): void {
    const previousSelection = this.selectedId;
    this.cards = [...snapshot.cards];
    this.zCounter = Math.max(snapshot.zCounter, ...snapshot.cards.map((card) => card.z), 0);
    this.selectedId =
      snapshot.selectedId && snapshot.cards.some((card) => card.id === snapshot.selectedId)
        ? snapshot.selectedId
        : null;
    this.emit({ type: 'cards', cards: this.cards });
    if (previousSelection !== this.selectedId) {
      this.emit({ type: 'selection', selectedId: this.selectedId });
    }
    this.emitHistory();
  }

  private emitHistory(): void {
    this.emit({ type: 'history', state: this.getHistoryState() });
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
