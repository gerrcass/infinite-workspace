import { clampZoom, isFiniteCamera, type Camera } from '../camera/camera';
import { CARD_WIDTHS, isCardColor, type Board, type Card, type ChecklistItem } from './types';

/** The key carries the schema version as well as the record, per the ADR. */
export const STORAGE_KEY = 'infinite-workspace:board:v1';
export const SCHEMA_VERSION = 1;
export const MAX_SAVED_CARDS = 500;

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedBoardData {
  readonly cards: readonly Card[];
  readonly zCounter: number;
  readonly camera: Camera;
}

export type LoadBoardResult =
  | { readonly status: 'loaded'; readonly board: Board; readonly camera: Camera }
  | { readonly status: 'empty' }
  | { readonly status: 'invalid' }
  | { readonly status: 'error' };

export type SaveStatus = 'saving' | 'saved' | 'session' | 'error';

interface SavedRecord extends SavedBoardData {
  readonly version: typeof SCHEMA_VERSION;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseChecklistItem(value: unknown): ChecklistItem | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !isNonEmptyString(value.id) ||
    typeof value.text !== 'string' ||
    typeof value.done !== 'boolean'
  ) {
    return null;
  }
  return { id: value.id, text: value.text, done: value.done };
}

function parseCard(value: unknown): Card | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !isNonEmptyString(value.id) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.z) ||
    typeof value.tag !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.body !== 'string'
  ) {
    return null;
  }
  if (typeof value.width !== 'string' || !Object.hasOwn(CARD_WIDTHS, value.width)) {
    return null;
  }
  if (typeof value.color !== 'string' || !isCardColor(value.color)) {
    return null;
  }
  if (!Array.isArray(value.checklist)) {
    return null;
  }

  const checklist: ChecklistItem[] = [];
  const itemIds = new Set<string>();
  for (const rawItem of value.checklist) {
    const item = parseChecklistItem(rawItem);
    if (!item || itemIds.has(item.id)) {
      return null;
    }
    itemIds.add(item.id);
    checklist.push(item);
  }

  return {
    id: value.id,
    x: value.x,
    y: value.y,
    width: value.width as Card['width'],
    color: value.color,
    tag: value.tag,
    title: value.title,
    body: value.body,
    checklist,
    z: value.z,
  };
}

function parseRecord(value: unknown): SavedRecord | null {
  if (!isRecord(value) || value.version !== SCHEMA_VERSION) {
    return null;
  }
  if (!Array.isArray(value.cards) || value.cards.length > MAX_SAVED_CARDS) {
    return null;
  }
  if (!isFiniteNumber(value.zCounter) || value.zCounter < 0) {
    return null;
  }
  if (!isRecord(value.camera) || !isFiniteCamera(value.camera as unknown as Camera)) {
    return null;
  }

  const cards: Card[] = [];
  const ids = new Set<string>();
  for (const rawCard of value.cards) {
    const card = parseCard(rawCard);
    if (!card || ids.has(card.id)) {
      return null;
    }
    ids.add(card.id);
    cards.push(card);
  }

  const camera = value.camera as unknown as Camera;
  return {
    version: SCHEMA_VERSION,
    cards,
    zCounter: Math.max(value.zCounter, ...cards.map((card) => card.z), 0),
    camera: { x: camera.x, y: camera.y, zoom: clampZoom(camera.zoom) },
  };
}

/** Decode a raw localStorage value. Invalid or unsupported data returns null. */
export function decodeBoard(raw: string): { board: Board; camera: Camera } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const record = parseRecord(parsed);
  if (!record) {
    return null;
  }

  return {
    board: {
      cards: record.cards,
      selectedId: null,
      zCounter: record.zCounter,
    },
    camera: record.camera,
  };
}

export function encodeBoard(data: SavedBoardData): string {
  const record: SavedRecord = {
    version: SCHEMA_VERSION,
    cards: data.cards,
    zCounter: data.zCounter,
    camera: data.camera,
  };
  return JSON.stringify(record);
}

export function loadBoard(storage: StoragePort): LoadBoardResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'error' };
  }

  if (raw === null) {
    return { status: 'empty' };
  }

  const decoded = decodeBoard(raw);
  if (!decoded) {
    return { status: 'invalid' };
  }
  return { status: 'loaded', board: decoded.board, camera: decoded.camera };
}

export function saveBoard(storage: StoragePort, data: SavedBoardData): boolean {
  try {
    storage.setItem(STORAGE_KEY, encodeBoard(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedBoard(storage: StoragePort): boolean {
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export interface BoardPersistenceOptions {
  readonly storage: StoragePort | null;
  readonly onStatus: (status: SaveStatus) => void;
  readonly delayMs?: number;
}

/**
 * Debounced board writer. Storage is injected so the store stays DOM-free and
 * unit tests can simulate quotas, blocks, and slow writes.
 */
export class BoardPersistence {
  private readonly storage: StoragePort | null;
  private readonly onStatus: (status: SaveStatus) => void;
  private readonly delayMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest: SavedBoardData | null = null;

  constructor(options: BoardPersistenceOptions) {
    this.storage = options.storage;
    this.onStatus = options.onStatus;
    this.delayMs = options.delayMs ?? 250;
  }

  schedule(cards: readonly Card[], zCounter: number, camera: Camera): void {
    if (!this.storage) {
      this.onStatus('session');
      return;
    }

    this.latest = { cards, zCounter, camera };
    this.onStatus('saving');
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.write();
    }, this.delayMs);
  }

  /** Write immediately, used when the page is going away. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.write();
  }

  /** Remove the stored record and stop pending writes. */
  clearStored(): boolean {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.latest = null;
    if (!this.storage) {
      return false;
    }
    return clearSavedBoard(this.storage);
  }

  setSessionOnly(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.latest = null;
    this.onStatus('session');
  }

  markStatus(status: SaveStatus): void {
    this.onStatus(status);
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.latest = null;
  }

  private write(): void {
    if (!this.latest) {
      return;
    }
    if (!this.storage) {
      this.onStatus('session');
      return;
    }
    const saved = saveBoard(this.storage, this.latest);
    this.onStatus(saved ? 'saved' : 'error');
  }
}
