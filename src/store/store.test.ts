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
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'cards' }));

    const updated = store.updateCard(card.id, { title: 'A real thought' });
    expect(updated?.title).toBe('A real thought');
    expect(store.getCard(card.id)?.title).toBe('A real thought');
    expect(listener).toHaveBeenLastCalledWith({ type: 'card', card: updated });

    store.select(card.id);
    store.removeCard(card.id);
    expect(store.getCards()).toHaveLength(216);
    expect(store.getSelectedId()).toBeNull();
  });

  it('updates card text without touching the focused field value', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const card = store.getCards()[1];
    expect(card).toBeDefined();
    if (!card) {
      return;
    }

    store.updateCardText(card.id, 'title', 'Live title');
    expect(store.getCard(card.id)?.title).toBe('Live title');
    store.updateCardText(card.id, 'body', 'Line one\nLine two');
    expect(store.getCard(card.id)?.body).toBe('Line one\nLine two');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'card', card: expect.objectContaining({ id: card.id }) }),
    );

    listener.mockClear();
    store.updateCardText(card.id, 'title', 'Live title');
    expect(listener).not.toHaveBeenCalled();
  });

  it('edits, toggles, adds, and removes checklist items', () => {
    const store = makeStore();
    const card = store.getCards().find((entry) => entry.checklist.length > 0);
    expect(card).toBeDefined();
    const item = card?.checklist[0];
    if (!card || !item) {
      return;
    }

    store.updateChecklistItemText(card.id, item.id, 'Reconsidered');
    expect(store.getCard(card.id)?.checklist[0]?.text).toBe('Reconsidered');

    store.toggleChecklistItem(card.id, item.id);
    expect(store.getCard(card.id)?.checklist[0]?.done).toBe(!item.done);
    store.toggleChecklistItem(card.id, item.id, item.done);
    expect(store.getCard(card.id)?.checklist[0]?.done).toBe(item.done);

    const before = store.getCard(card.id)?.checklist.length ?? 0;
    const added = store.addChecklistItem(card.id, 'A fresh item');
    expect(added?.text).toBe('A fresh item');
    expect(added?.id).toBeTruthy();
    expect(store.getCard(card.id)?.checklist).toHaveLength(before + 1);

    if (added) {
      store.removeChecklistItem(card.id, added.id);
    }
    expect(store.getCard(card.id)?.checklist).toHaveLength(before);
    expect(store.getCard(card.id)?.checklist.some((entry) => entry.id === added?.id)).toBe(false);
  });

  it('gives every added checklist item a unique id', () => {
    const store = makeStore();
    const card = store.getCards()[1];
    if (!card) {
      return;
    }
    const first = store.addChecklistItem(card.id);
    const second = store.addChecklistItem(card.id);
    expect(first?.id).not.toBe(second?.id);
    const ids = store.getCard(card.id)?.checklist.map((entry) => entry.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ignores checklist actions for missing cards or items', () => {
    const store = makeStore();
    expect(store.addChecklistItem('missing')).toBeNull();
    expect(store.toggleChecklistItem('missing', 'nope')).toBeNull();
    expect(store.updateChecklistItemText('missing', 'nope', 'x')).toBeNull();
    expect(store.removeChecklistItem('missing', 'nope')).toBeNull();
  });

  it('undoes and redoes add with a full card sync and selection restore', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const card: Card = {
      id: 'note-history',
      x: 10,
      y: 20,
      width: 'regular',
      color: 'butter',
      tag: 'NOTE',
      title: 'History note',
      body: '',
      checklist: [],
      z: 300,
    };

    store.addCard(card);
    store.select(card.id);
    expect(store.getHistoryState()).toEqual({ canUndo: true, canRedo: false });

    expect(store.undo()).toBe(true);
    expect(store.getCards()).toHaveLength(216);
    expect(store.getSelectedId()).toBeNull();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'cards' }));
    expect(store.getHistoryState()).toEqual({ canUndo: false, canRedo: true });

    expect(store.redo()).toBe(true);
    expect(store.getCard(card.id)?.title).toBe('History note');
    expect(store.getSelectedId()).toBe(card.id);
  });

  it('coalesces a text session into one undo entry and discards empty sessions', () => {
    const store = makeStore();
    const card = store.getCards()[1];
    if (!card) {
      return;
    }
    const original = card.title;

    store.beginTextSession();
    store.updateCardText(card.id, 'title', 'H');
    store.updateCardText(card.id, 'title', 'Hello');
    store.updateCardText(card.id, 'title', 'Hello wall');
    expect(store.getHistoryState()).toEqual({ canUndo: false, canRedo: false });
    expect(store.undo()).toBe(false);
    store.endTextSession();
    expect(store.getHistoryState()).toEqual({ canUndo: true, canRedo: false });

    expect(store.undo()).toBe(true);
    expect(store.getCard(card.id)?.title).toBe(original);
    expect(store.redo()).toBe(true);
    expect(store.getCard(card.id)?.title).toBe('Hello wall');

    const stateBeforeEmptySession = store.getHistoryState();
    store.beginTextSession();
    store.endTextSession();
    expect(store.getHistoryState()).toEqual(stateBeforeEmptySession);
  });

  it('ends a text session before a structural action and keeps both entries', () => {
    const store = makeStore();
    const card = store.getCards().find((entry) => entry.checklist.length > 0);
    const item = card?.checklist[0];
    if (!card || !item) {
      return;
    }
    const originalTitle = card.title;

    store.beginTextSession();
    store.updateCardText(card.id, 'title', 'Text before checkbox');
    store.toggleChecklistItem(card.id, item.id);
    expect(store.getHistoryState()).toEqual({ canUndo: true, canRedo: false });

    expect(store.undo()).toBe(true);
    expect(store.getCard(card.id)?.checklist[0]?.done).toBe(item.done);
    expect(store.getCard(card.id)?.title).toBe('Text before checkbox');

    expect(store.undo()).toBe(true);
    expect(store.getCard(card.id)?.title).toBe(originalTitle);
  });

  it('coalesces one drag into one entry and restores position, z, and selection', () => {
    const store = makeStore();
    const card = store.getCards()[1];
    if (!card) {
      return;
    }
    const original = { x: card.x, y: card.y, z: card.z };

    const started = store.beginMoveSession(card.id);
    expect(started?.id).toBe(card.id);
    const topZ = Math.max(...store.getCards().map((entry) => entry.z));
    expect(store.getCard(card.id)?.z).toBe(topZ);
    expect(store.getSelectedId()).toBe(card.id);
    expect(store.getHistoryState()).toEqual({ canUndo: false, canRedo: false });
    store.moveCard(card.id, card.x + 40, card.y + 30);
    store.moveCard(card.id, card.x + 90, card.y + 70);
    store.endMoveSession(true);
    expect(store.getHistoryState()).toEqual({ canUndo: true, canRedo: false });

    expect(store.undo()).toBe(true);
    expect(store.getCard(card.id)).toMatchObject(original);
    expect(store.getSelectedId()).toBeNull();

    expect(store.redo()).toBe(true);
    expect(store.getCard(card.id)).toMatchObject({
      x: original.x + 90,
      y: original.y + 70,
    });
    expect(store.getSelectedId()).toBe(card.id);
  });

  it('does not record a drag that never crossed the threshold', () => {
    const store = makeStore();
    const card = store.getCards()[1];
    if (!card) {
      return;
    }
    store.beginMoveSession(card.id);
    store.endMoveSession(false);
    expect(store.getHistoryState()).toEqual({ canUndo: false, canRedo: false });
  });

  it('duplicates with an offset, new ids, top z, and selection', () => {
    const store = makeStore();
    const original = store.getCards().find((card) => card.checklist.length > 0);
    if (!original) {
      return;
    }
    store.select(original.id);
    const copy = store.duplicateCard(original.id);
    expect(copy).not.toBeNull();
    if (!copy) {
      return;
    }

    expect(copy.id).not.toBe(original.id);
    expect(copy.x).toBe(original.x + 28);
    expect(copy.y).toBe(original.y + 28);
    expect(copy.z).toBeGreaterThan(Math.max(...store.getCards().map((card) => card.z)) - 1);
    expect(copy.checklist.map((item) => item.id)).not.toEqual(
      original.checklist.map((item) => item.id),
    );
    expect(store.getSelectedId()).toBe(copy.id);

    expect(store.undo()).toBe(true);
    expect(store.getCard(copy.id)).toBeUndefined();
    expect(store.getSelectedId()).toBe(original.id);
  });

  it('undoes colour, checklist, and delete actions', () => {
    const store = makeStore();
    const card = store.getCards().find((entry) => entry.checklist.length > 0);
    if (!card) {
      return;
    }
    const originalColor = card.color;
    const originalItem = card.checklist[0];
    if (!originalItem) {
      return;
    }

    store.setCardColor(card.id, 'sky');
    expect(store.getCard(card.id)?.color).toBe('sky');
    store.undo();
    expect(store.getCard(card.id)?.color).toBe(originalColor);

    store.toggleChecklistItem(card.id, originalItem.id);
    store.undo();
    expect(store.getCard(card.id)?.checklist[0]?.done).toBe(originalItem.done);

    store.select(card.id);
    store.removeCard(card.id);
    expect(store.getCard(card.id)).toBeUndefined();
    store.undo();
    expect(store.getCard(card.id)?.id).toBe(card.id);
    expect(store.getSelectedId()).toBe(card.id);
  });

  it('caps undo depth and drops the oldest entries', () => {
    const store = new BoardStore({ cards: [], selectedId: null, zCounter: 0 }, camera, {
      historyLimit: 50,
    });
    for (let index = 0; index < 60; index += 1) {
      store.addCard({
        id: `depth-${index}`,
        x: index * 10,
        y: 0,
        width: 'narrow',
        color: 'cream',
        tag: 'NOTE',
        title: `Card ${index}`,
        body: '',
        checklist: [],
        z: index + 1,
      });
    }

    let undone = 0;
    while (store.undo()) {
      undone += 1;
    }
    expect(undone).toBe(50);
    expect(store.getCards()).toHaveLength(10);
  });

  it('clears redo on the next action and ignores selection/camera changes', () => {
    const store = makeStore();
    const card = store.getCards()[1];
    if (!card) {
      return;
    }
    store.setCamera({ x: 1, y: 2, zoom: 1 });
    store.select(card.id);
    expect(store.getHistoryState()).toEqual({ canUndo: false, canRedo: false });

    store.beginTextSession();
    store.updateCardText(card.id, 'title', 'Changed');
    store.endTextSession();
    store.undo();
    expect(store.getHistoryState()).toEqual({ canUndo: false, canRedo: true });
    store.setCamera({ x: 5, y: 6, zoom: 1 });
    expect(store.getHistoryState()).toEqual({ canUndo: false, canRedo: true });
    store.setCardColor(card.id, 'mint');
    expect(store.getHistoryState()).toEqual({ canUndo: true, canRedo: false });
  });

  it('resets the board without carrying history', () => {
    const store = makeStore();
    const card = store.getCards()[1];
    if (!card) {
      return;
    }
    store.beginTextSession();
    store.updateCardText(card.id, 'title', 'Temporary');
    store.endTextSession();
    expect(store.getHistoryState().canUndo).toBe(true);

    store.resetBoard(createSeed(), { x: -10, y: -20, zoom: 0.5 });
    expect(store.getCards()).toHaveLength(216);
    expect(store.getHistoryState()).toEqual({ canUndo: false, canRedo: false });
    expect(store.getCamera()).toEqual({ x: -10, y: -20, zoom: 0.5 });
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
