import { describe, expect, it, vi } from 'vitest';
import { createSeed } from './seed';
import { BoardStore } from './store';
import type { Card } from './types';

const camera = { x: -120, y: 80, zoom: 0.75 };

function makeStore(): BoardStore {
  return new BoardStore(createSeed(), camera);
}

describe('board store', () => {
  it('starts with the seed, camera, and no selection', () => {
    const store = makeStore();
    const snapshot = store.getSnapshot();
    expect(snapshot.cards).toHaveLength(216);
    expect(snapshot.camera).toEqual(camera);
    expect(snapshot.selectedId).toBeNull();
  });

  it('notifies camera changes once and ignores no-ops', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setCamera({ x: -10, y: 20, zoom: 1.2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({
      type: 'camera',
      camera: { x: -10, y: 20, zoom: 1.2 },
    });

    store.setCamera({ x: -10, y: 20, zoom: 1.2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clamps and rejects invalid cameras', () => {
    const store = makeStore();
    store.setCamera({ x: 0, y: 0, zoom: 100 });
    expect(store.getCamera().zoom).toBe(3);

    store.setCamera({ x: Number.NaN, y: 0, zoom: 1 });
    expect(store.getCamera()).toEqual({ x: 0, y: 0, zoom: 3 });
  });

  it('selects only cards that exist and clears with null', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const card = store.getCards()[1];
    expect(card).toBeDefined();
    if (!card) {
      return;
    }

    store.select(card.id);
    expect(store.getSelectedId()).toBe(card.id);
    expect(listener).toHaveBeenCalledWith({ type: 'selection', selectedId: card.id });

    store.select('missing-card');
    expect(store.getSelectedId()).toBe(card.id);

    store.select(null);
    expect(store.getSelectedId()).toBeNull();
  });

  it('adds, updates, and removes cards through store events', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const card: Card = {
      id: 'note-1',
      x: 10,
      y: 20,
      width: 'regular',
      color: 'butter',
      tag: 'NOTE',
      title: 'Untitled note',
      body: '',
      checklist: [],
      z: 300,
    };

    store.addCard(card);
    expect(store.getCards()).toHaveLength(217);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'cards' }));

    const updated = store.updateCard(card.id, { title: 'A real thought' });
    expect(updated?.title).toBe('A real thought');
    expect(store.getCard(card.id)?.title).toBe('A real thought');
    expect(listener).toHaveBeenLastCalledWith({ type: 'card', card: updated });

    store.select(card.id);
    store.removeCard(card.id);
    expect(store.getCards()).toHaveLength(216);
    expect(store.getSelectedId()).toBeNull();
  });

  it('unsubscribes cleanly', () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.select(null);
    expect(listener).not.toHaveBeenCalled();
  });
});
