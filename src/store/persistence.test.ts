import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Camera } from '../camera/camera';
import {
  BoardPersistence,
  SCHEMA_VERSION,
  STORAGE_KEY,
  clearSavedBoard,
  decodeBoard,
  encodeBoard,
  loadBoard,
  saveBoard,
  type SaveStatus,
  type StoragePort,
} from './persistence';
import { createSeed } from './seed';

const camera: Camera = { x: -420, y: 180, zoom: 0.8 };

class MemoryStorage implements StoragePort {
  readonly data = new Map<string, string>();
  failReads = false;
  failWrites = false;
  failRemoves = false;

  getItem(key: string): string | null {
    if (this.failReads) {
      throw new Error('read blocked');
    }
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('quota exceeded');
    }
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemoves) {
      throw new Error('remove blocked');
    }
    this.data.delete(key);
  }
}

function validData() {
  const seed = createSeed();
  return {
    cards: seed.cards,
    zCounter: seed.zCounter,
    camera,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('board persistence format', () => {
  it('round-trips cards, z counter, and camera', () => {
    const data = validData();
    const decoded = decodeBoard(encodeBoard(data));
    expect(decoded).not.toBeNull();
    expect(decoded?.board.cards).toEqual(data.cards);
    expect(decoded?.board.zCounter).toBe(data.zCounter);
    expect(decoded?.board.selectedId).toBeNull();
    expect(decoded?.camera).toEqual(camera);
  });

  it('loads a saved record and reports an empty store', () => {
    const storage = new MemoryStorage();
    expect(loadBoard(storage)).toEqual({ status: 'empty' });

    storage.data.set(STORAGE_KEY, encodeBoard(validData()));
    const loaded = loadBoard(storage);
    expect(loaded.status).toBe('loaded');
    if (loaded.status === 'loaded') {
      expect(loaded.board.cards).toHaveLength(216);
      expect(loaded.camera).toEqual(camera);
    }
  });

  it('rejects invalid JSON, unsupported versions, and malformed cards', () => {
    expect(decodeBoard('{not json')).toBeNull();
    expect(decodeBoard('null')).toBeNull();
    expect(decodeBoard('[]')).toBeNull();

    const unsupported = JSON.parse(encodeBoard(validData())) as Record<string, unknown>;
    unsupported.version = SCHEMA_VERSION + 1;
    expect(decodeBoard(JSON.stringify(unsupported))).toBeNull();

    const badCard = JSON.parse(encodeBoard(validData())) as {
      cards: Array<Record<string, unknown>>;
    };
    if (badCard.cards[0]) {
      badCard.cards[0].x = 'far away';
    }
    expect(decodeBoard(JSON.stringify(badCard))).toBeNull();

    const badColor = JSON.parse(encodeBoard(validData())) as {
      cards: Array<Record<string, unknown>>;
    };
    if (badColor.cards[0]) {
      badColor.cards[0].color = 'neon';
    }
    expect(decodeBoard(JSON.stringify(badColor))).toBeNull();

    const duplicate = JSON.parse(encodeBoard(validData())) as {
      cards: Array<Record<string, unknown>>;
    };
    if (duplicate.cards[0] && duplicate.cards[1]) {
      duplicate.cards[1].id = duplicate.cards[0].id;
    }
    expect(decodeBoard(JSON.stringify(duplicate))).toBeNull();
  });

  it('rejects an invalid camera but clamps a finite zoom', () => {
    const invalid = JSON.parse(encodeBoard(validData())) as {
      camera: Record<string, unknown>;
    };
    invalid.camera = { x: 0, y: 0, zoom: 0 };
    expect(decodeBoard(JSON.stringify(invalid))).toBeNull();

    const clamped = JSON.parse(encodeBoard(validData())) as {
      camera: Record<string, unknown>;
    };
    clamped.camera = { x: 10, y: 20, zoom: 99 };
    const decoded = decodeBoard(JSON.stringify(clamped));
    expect(decoded?.camera.zoom).toBe(3);
  });

  it('surfaces storage read/write/remove failures instead of throwing', () => {
    const storage = new MemoryStorage();
    storage.failReads = true;
    expect(loadBoard(storage)).toEqual({ status: 'error' });

    storage.failReads = false;
    storage.failWrites = true;
    expect(saveBoard(storage, validData())).toBe(false);

    storage.failRemoves = true;
    expect(clearSavedBoard(storage)).toBe(false);
  });

  it('writes and clears the versioned key', () => {
    const storage = new MemoryStorage();
    expect(saveBoard(storage, validData())).toBe(true);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    expect(clearSavedBoard(storage)).toBe(true);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });
});

describe('debounced board persistence', () => {
  it('saves once after the debounce with the latest camera', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const statuses: SaveStatus[] = [];
    const controller = new BoardPersistence({
      storage,
      onStatus: (status) => statuses.push(status),
      delayMs: 250,
    });
    const data = validData();

    controller.schedule(data.cards, data.zCounter, { x: 0, y: 0, zoom: 1 });
    controller.schedule(data.cards, data.zCounter, { x: 12, y: 34, zoom: 1.2 });
    expect(statuses).toEqual(['saving', 'saving']);
    expect(storage.data.size).toBe(0);

    vi.advanceTimersByTime(249);
    expect(storage.data.size).toBe(0);
    vi.advanceTimersByTime(1);
    expect(statuses.at(-1)).toBe('saved');
    expect(storage.data.size).toBe(1);

    const loaded = loadBoard(storage);
    expect(loaded.status).toBe('loaded');
    if (loaded.status === 'loaded') {
      expect(loaded.camera).toEqual({ x: 12, y: 34, zoom: 1.2 });
    }
    controller.stop();
  });

  it('flushes immediately and cancels the pending timer', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const statuses: SaveStatus[] = [];
    const controller = new BoardPersistence({
      storage,
      onStatus: (status) => statuses.push(status),
      delayMs: 250,
    });
    const data = validData();
    controller.schedule(data.cards, data.zCounter, data.camera);
    controller.flush();
    expect(storage.data.size).toBe(1);
    expect(statuses).toEqual(['saving', 'saved']);
    vi.advanceTimersByTime(500);
    expect(storage.data.size).toBe(1);
  });

  it('reports session-only when storage is missing and not saved on failure', () => {
    const statuses: SaveStatus[] = [];
    const missing = new BoardPersistence({
      storage: null,
      onStatus: (status) => statuses.push(status),
    });
    const data = validData();
    missing.schedule(data.cards, data.zCounter, data.camera);
    expect(statuses).toEqual(['session']);

    const storage = new MemoryStorage();
    storage.failWrites = true;
    const failing = new BoardPersistence({
      storage,
      onStatus: (status) => statuses.push(status),
      delayMs: 0,
    });
    vi.useFakeTimers();
    failing.schedule(data.cards, data.zCounter, data.camera);
    vi.advanceTimersByTime(0);
    expect(statuses.at(-1)).toBe('error');
  });

  it('clears stored data and stops pending writes', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    storage.data.set(STORAGE_KEY, encodeBoard(validData()));
    const controller = new BoardPersistence({
      storage,
      onStatus: () => undefined,
      delayMs: 250,
    });
    const data = validData();
    controller.schedule(data.cards, data.zCounter, data.camera);
    expect(controller.clearStored()).toBe(true);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });
});
