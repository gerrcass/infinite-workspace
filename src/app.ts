import {
  editingAssistCamera,
  fitBounds,
  initialCamera,
  screenToWorld,
  zoomAtCenter,
  type Camera,
  type ViewportSize,
} from './camera/camera';
import { createSeed } from './store/seed';
import { BoardPersistence, loadBoard, type SaveStatus } from './store/persistence';
import { BoardStore, type StoreEvent } from './store/store';
import { CARD_WIDTHS, type Card, type CardColor } from './store/types';
import { CanvasRenderer, detectCanvasSupport } from './render/canvas-renderer';
import { DomRenderer } from './render/dom-renderer';
import { parseRenderModeParam, resolveRenderMode, type RenderMode } from './render/mode';
import type { Renderer } from './render/renderer';
import type { CardViewHandlers } from './ui/card-view';
import { createChrome, type Chrome } from './ui/chrome';
import { attachInteractions } from './ui/interactions';
import { openBrowserStorage } from './ui/storage';

const MINOR_GRID_WORLD = 20;
const MAJOR_GRID_WORLD = 100;
const FIT_PADDING = 90;
const MAX_CARDS = 500;
const ADD_OFFSET = 24;

const SAVE_LABELS: Record<SaveStatus, string> = {
  saving: 'Saving',
  saved: 'Saved',
  session: 'Session only',
  error: 'Not saved',
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function newCardId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `note-${crypto.randomUUID()}`;
  }
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isTextField(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'range'].includes(
      element.type,
    );
  }
  return false;
}

/**
 * Composition root: owns the shell, store, renderer choice, camera animation,
 * persistence, and the dotted ground. Renderer internals never leak in here.
 */
export class App {
  private readonly board: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly scene: HTMLElement;
  private readonly store: BoardStore;
  private readonly chrome: Chrome;
  private readonly persistence: BoardPersistence;
  private readonly hasStorage: boolean;
  private readonly cardHandlers: CardViewHandlers;
  private renderer: Renderer;
  private detachInteractions: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private cameraFrame = 0;
  private suppressPersistence = false;
  private destroyed = false;
  private viewport: ViewportSize;
  private readonly capabilities = { canvas: detectCanvasSupport() };
  private readonly requestedMode = parseRenderModeParam(
    new URLSearchParams(window.location.search).get('render'),
  );

  constructor(private readonly root: HTMLElement) {
    this.root.replaceChildren();
    this.board = element('main', 'board');
    this.board.id = 'board';
    this.board.tabIndex = 0;
    this.board.setAttribute('aria-label', 'Infinite Workspace board');
    this.board.setAttribute('aria-describedby', 'board-instructions');

    const instructions = element('p', 'sr-only', '');
    instructions.id = 'board-instructions';
    instructions.textContent =
      'A board of live HTML cards. Click card text to edit it. Drag a card by its top strip to move it. Press N to add a note, Control or Command plus D to duplicate, Delete to remove, Control or Command plus Z to undo. Drag empty paper, hold Space, use the arrow keys, or scroll to pan. Hold Control or Command while scrolling to zoom. Press zero to fit the board and one for 100 percent. Press question mark for help. Use your browser’s native Find command to search real card text.';

    this.grid = element('div', 'board__grid');
    this.grid.setAttribute('aria-hidden', 'true');

    this.scene = element('div', 'scene');
    this.scene.dataset.testid = 'scene';

    this.board.append(this.grid, this.scene, instructions);
    this.root.append(this.board);

    this.viewport = this.measureViewport();
    const storage = openBrowserStorage();
    this.hasStorage = storage.port !== null;
    const seed = createSeed();
    const openingCamera = initialCamera(this.viewport);
    let board = seed;
    let camera = openingCamera;
    let loadStatus: 'loaded' | 'empty' | 'invalid' | 'error' | 'session';

    if (!storage.port) {
      loadStatus = storage.blocked ? 'error' : 'session';
    } else {
      const loaded = loadBoard(storage.port);
      loadStatus = loaded.status;
      if (loaded.status === 'loaded') {
        board = loaded.board;
        camera = loaded.camera;
      }
    }

    this.store = new BoardStore(board, camera);
    this.cardHandlers = {
      updateCardText: (cardId, field, text) => {
        this.store.updateCardText(cardId, field, text);
      },
      updateChecklistText: (cardId, itemId, text) => {
        this.store.updateChecklistItemText(cardId, itemId, text);
      },
      toggleChecklistItem: (cardId, itemId, done) => {
        this.store.toggleChecklistItem(cardId, itemId, done);
      },
      addChecklistItem: (cardId) => this.store.addChecklistItem(cardId)?.id ?? null,
      removeChecklistItem: (cardId, itemId) => {
        this.store.removeChecklistItem(cardId, itemId);
      },
    };

    this.chrome = createChrome({
      onAddNote: () => this.addNote(),
      onZoomIn: () => this.zoomBy(1.2),
      onZoomOut: () => this.zoomBy(1 / 1.2),
      onResetZoom: () => this.resetZoom(),
      onFit: () => this.fitBoard(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onDuplicate: () => this.duplicateSelected(),
      onDelete: () => this.deleteSelected(),
      onColor: (color) => this.colorSelected(color),
      onResetDemo: () => this.resetDemo(),
      onClearSavedData: () => this.clearSavedData(),
    });
    // Chrome comes before the 216 card articles in DOM order so keyboard users
    // reach the toolbar before tabbing through the whole wall.
    this.board.insertBefore(this.chrome.element, this.scene);

    this.persistence = new BoardPersistence({
      storage: storage.port,
      onStatus: (status) => this.chrome.setSaveState(SAVE_LABELS[status], status),
    });

    const resolution = resolveRenderMode(this.requestedMode, this.capabilities);
    this.renderer = this.createRenderer(resolution.mode);

    const snapshot = this.store.getSnapshot();
    this.renderer.mount({
      cards: snapshot.cards,
      camera: snapshot.camera,
      selectedId: snapshot.selectedId,
    });

    this.chrome.setRenderer(
      this.renderer.kind,
      this.renderer.kind === 'canvas'
        ? 'Cards are painted by the HTML-in-Canvas renderer'
        : this.capabilities.canvas
          ? 'Cards are positioned in the DOM renderer'
          : 'HTML-in-Canvas is unavailable; the complete DOM renderer is active',
    );
    this.chrome.setCardCount(snapshot.cards.length);
    this.chrome.setZoom(snapshot.camera.zoom);
    this.chrome.setHistoryState(this.store.getHistoryState());
    this.chrome.updateSelectionToolbar(null);
    this.updateGrid(snapshot.camera);

    if (loadStatus === 'loaded') {
      this.chrome.setSaveState('Saved', 'saved');
    } else if (loadStatus === 'error') {
      this.chrome.setSaveState('Not saved', 'error');
    } else if (loadStatus === 'session') {
      this.chrome.setSaveState('Session only', 'session');
    } else {
      this.persistence.schedule(snapshot.cards, snapshot.zCounter, snapshot.camera);
    }

    this.detachInteractions = attachInteractions(this.board, {
      getCamera: () => this.store.getCamera(),
      getViewport: () => this.viewport,
      onCamera: (nextCamera) => {
        this.cancelCameraAnimation();
        this.store.setCamera(nextCamera);
      },
      onSelect: (cardId) => this.store.select(cardId),
      onAddNote: () => this.addNote(),
      onZoomIn: () => this.zoomBy(1.2),
      onZoomOut: () => this.zoomBy(1 / 1.2),
      onResetZoom: () => this.resetZoom(),
      onFit: () => this.fitBoard(),
      onHelp: () => this.chrome.openHelp(),
      onEditableFocus: (cardId) => {
        this.store.select(cardId);
        this.store.beginTextSession();
        this.assistEditing(cardId);
      },
      onEditableBlur: () => {
        this.store.endTextSession();
      },
      onDeleteSelected: () => this.deleteSelected(),
      onDuplicateSelected: () => this.duplicateSelected(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onEscape: () => this.store.select(null),
      onCardDragStart: (cardId) => {
        const card = this.store.beginMoveSession(cardId);
        return card ? { x: card.x, y: card.y } : null;
      },
      onCardDragMove: (cardId, x, y) => {
        this.store.moveCard(cardId, x, y);
      },
      onCardDragEnd: (moved) => {
        this.store.endMoveSession(moved);
      },
    });

    this.unsubscribe = this.store.subscribe((event) => {
      this.handleStoreEvent(event);
      if (
        !this.suppressPersistence &&
        (event.type === 'cards' || event.type === 'card' || event.type === 'camera')
      ) {
        const current = this.store.getSnapshot();
        this.persistence.schedule(current.cards, current.zCounter, current.camera);
      }
    });

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pagehide', this.handlePageHide);

    if (!this.capabilities.canvas) {
      window.setTimeout(() => {
        if (this.destroyed) {
          return;
        }
        this.chrome.showToast(
          this.requestedMode === 'canvas'
            ? 'The canvas renderer needs Chrome 157+. The board is using the complete DOM renderer instead.'
            : 'HTML-in-Canvas is not available in this browser. Every card is rendered in the DOM, with all features intact.',
        );
      }, 500);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelCameraAnimation();
    this.persistence.flush();
    this.persistence.stop();
    this.detachInteractions?.();
    this.unsubscribe?.();
    this.renderer.destroy();
    this.chrome.destroy();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pagehide', this.handlePageHide);
    this.board.remove();
  }

  private createRenderer(mode: RenderMode): Renderer {
    if (mode === 'canvas') {
      try {
        return new CanvasRenderer({
          container: this.scene,
          cardHandlers: this.cardHandlers,
          onRuntimeError: (error) => this.handleCanvasFailure(error),
        });
      } catch (error) {
        this.chrome.showToast(
          'The canvas renderer could not start, so the board is using the DOM renderer. Nothing was lost.',
        );
        console.warn('Canvas renderer could not start; using DOM.', error);
      }
    }

    return new DomRenderer({ container: this.scene, cardHandlers: this.cardHandlers });
  }

  /**
   * When text is focused at a very low zoom, ease the camera to a comfortable
   * scale around the card. The field keeps focus and native selection.
   */
  private assistEditing(cardId: string): void {
    const camera = this.store.getCamera();
    if (camera.zoom >= 0.7) {
      return;
    }
    const card = this.store.getCard(cardId);
    const element = this.renderer.getCardElement(cardId);
    if (!card || !element) {
      return;
    }
    const worldCenter = {
      x: card.x + CARD_WIDTHS[card.width] / 2,
      y: card.y + element.offsetHeight / 2,
    };
    const target = editingAssistCamera(camera, this.viewport, worldCenter);
    if (target) {
      this.animateCamera(target, 240);
    }
  }

  private handleStoreEvent(event: StoreEvent): void {
    if (event.type === 'camera') {
      this.renderer.setCamera(event.camera);
      this.chrome.setZoom(event.camera.zoom);
      this.updateGrid(event.camera);
      this.updateSelectionToolbar();
      return;
    }
    if (event.type === 'card') {
      this.renderer.syncCard(event.card);
      this.updateSelectionToolbar();
      return;
    }
    if (event.type === 'cards') {
      this.renderer.syncCards(event.cards, this.store.getSelectedId());
      this.chrome.setCardCount(event.cards.length);
      this.updateSelectionToolbar();
      return;
    }
    if (event.type === 'selection') {
      this.renderer.setSelection(event.selectedId);
      this.updateSelectionToolbar();
      return;
    }
    this.chrome.setHistoryState(event.state);
  }

  private handleCanvasFailure(error: unknown): void {
    queueMicrotask(() => {
      if (this.destroyed || this.renderer.kind === 'dom') {
        return;
      }

      const snapshot = this.store.getSnapshot();
      this.renderer.destroy();
      this.renderer = new DomRenderer({
        container: this.scene,
        cardHandlers: this.cardHandlers,
      });
      this.renderer.mount({
        cards: snapshot.cards,
        camera: snapshot.camera,
        selectedId: snapshot.selectedId,
      });
      this.chrome.setRenderer('dom', 'Canvas drawing failed; the DOM renderer is active');
      this.chrome.showToast(
        'The canvas renderer hit a drawing error, so the board switched to the DOM renderer. Nothing was lost.',
      );
      this.updateSelectionToolbar();
      console.warn('Canvas drawing failed; continuing in DOM mode.', error);
    });
  }

  private measureViewport(): ViewportSize {
    const rect = this.board.getBoundingClientRect();
    return {
      width: Math.max(1, rect.width || window.innerWidth),
      height: Math.max(1, rect.height || window.innerHeight),
    };
  }

  private readonly handleResize = (): void => {
    this.viewport = this.measureViewport();
    this.updateGrid(this.store.getCamera());
    this.renderer.invalidate();
    this.updateSelectionToolbar();
  };

  private readonly handlePageHide = (): void => {
    this.persistence.flush();
  };

  private updateGrid(camera: Camera): void {
    const minorSize = Math.max(7, Math.round(MINOR_GRID_WORLD * camera.zoom));
    const majorSize = Math.max(minorSize + 1, Math.round(MAJOR_GRID_WORLD * camera.zoom));
    const offsetX = Math.round(-camera.x * camera.zoom);
    const offsetY = Math.round(-camera.y * camera.zoom);
    const minorOpacity = Math.min(1, Math.max(0, (camera.zoom - 0.18) / 0.16));

    this.grid.style.setProperty('--grid-minor-size', `${minorSize}px`);
    this.grid.style.setProperty('--grid-minor-x', `${positiveModulo(offsetX, minorSize)}px`);
    this.grid.style.setProperty('--grid-minor-y', `${positiveModulo(offsetY, minorSize)}px`);
    this.grid.style.setProperty('--grid-minor-opacity', minorOpacity.toFixed(3));
    this.grid.style.setProperty('--grid-major-size', `${majorSize}px`);
    this.grid.style.setProperty('--grid-major-x', `${positiveModulo(offsetX, majorSize)}px`);
    this.grid.style.setProperty('--grid-major-y', `${positiveModulo(offsetY, majorSize)}px`);
  }

  private zoomBy(factor: number): void {
    const camera = this.store.getCamera();
    this.animateCamera(zoomAtCenter(camera, this.viewport, camera.zoom * factor), 160);
  }

  private resetZoom(): void {
    this.animateCamera(zoomAtCenter(this.store.getCamera(), this.viewport, 1), 200);
  }

  private fitBoard(): void {
    const bounds = this.renderer.getWorldBounds();
    if (!bounds) {
      return;
    }
    this.animateCamera(fitBounds(bounds, this.viewport, FIT_PADDING), 240);
  }

  private addNote(): void {
    const snapshot = this.store.getSnapshot();
    if (snapshot.cards.length >= MAX_CARDS) {
      this.chrome.showToast(
        `This wall is full at ${MAX_CARDS} cards. Remove a note before adding another.`,
      );
      return;
    }

    const center = screenToWorld(this.store.getCamera(), {
      x: this.viewport.width / 2,
      y: this.viewport.height / 2,
    });
    const card: Card = {
      id: newCardId(),
      x: center.x - CARD_WIDTHS.regular / 2 + ADD_OFFSET,
      y: center.y - 80 + ADD_OFFSET,
      width: 'regular',
      color: 'butter',
      tag: 'NOTE',
      title: 'Untitled note',
      body: '',
      checklist: [],
      z: snapshot.zCounter + 1,
    };
    this.store.addCard(card);
    this.store.select(card.id);
    this.focusTitle(card.id);
  }

  private focusTitle(cardId: string): void {
    const title = this.renderer.getCardElement(cardId)?.querySelector<HTMLElement>('.card__title');
    if (!title) {
      return;
    }
    title.focus();
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(title);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private deleteSelected(): void {
    if (isTextField(document.activeElement)) {
      return;
    }
    const selectedId = this.store.getSelectedId();
    if (selectedId) {
      this.store.removeCard(selectedId);
    }
  }

  private duplicateSelected(): void {
    if (isTextField(document.activeElement)) {
      return;
    }
    if (this.store.getCards().length >= MAX_CARDS) {
      this.chrome.showToast(
        `This wall is full at ${MAX_CARDS} cards. Remove a note before duplicating another.`,
      );
      return;
    }
    const selectedId = this.store.getSelectedId();
    if (selectedId) {
      this.store.duplicateCard(selectedId);
    }
  }

  private colorSelected(color: CardColor): void {
    const selectedId = this.store.getSelectedId();
    if (selectedId) {
      this.store.setCardColor(selectedId, color);
    }
  }

  private undo(): void {
    if (isTextField(document.activeElement)) {
      return;
    }
    this.store.undo();
  }

  private redo(): void {
    if (isTextField(document.activeElement)) {
      return;
    }
    this.store.redo();
  }

  private resetDemo(): void {
    this.cancelCameraAnimation();
    this.suppressPersistence = true;
    try {
      const seed = createSeed();
      const camera = initialCamera(this.viewport);
      this.store.resetBoard(seed, camera);
      this.persistence.clearStored();
      this.persistence.schedule(seed.cards, seed.zCounter, camera);
    } finally {
      this.suppressPersistence = false;
    }
    this.chrome.showToast('Demo board restored: 216 cards and the opening camera.');
  }

  private clearSavedData(): void {
    this.cancelCameraAnimation();
    this.suppressPersistence = true;
    try {
      const seed = createSeed();
      this.store.resetBoard(seed, initialCamera(this.viewport));
    } finally {
      this.suppressPersistence = false;
    }
    const cleared = this.persistence.clearStored();
    this.persistence.setSessionOnly();
    if (this.hasStorage && !cleared) {
      this.persistence.markStatus('error');
      this.chrome.showToast(
        'Saved data could not be cleared, but this session is still usable. Check browser storage settings.',
      );
      return;
    }
    this.chrome.showToast('Saved data cleared. The demo board is back for this session.');
  }

  private updateSelectionToolbar(): void {
    const selectedId = this.store.getSelectedId();
    const card = selectedId ? this.store.getCard(selectedId) : undefined;
    const element = selectedId ? this.renderer.getCardElement(selectedId) : null;
    if (!card || !element) {
      this.chrome.updateSelectionToolbar(null);
      return;
    }

    // Derive screen geometry from the model and camera, not painted DOM
    // rectangles: in canvas mode hit-test geometry updates a paint later and a
    // stale toolbar could cover the card's own drag strip.
    const camera = this.store.getCamera();
    const left = (card.x - camera.x) * camera.zoom;
    const top = (card.y - camera.y) * camera.zoom;
    const width = CARD_WIDTHS[card.width] * camera.zoom;
    const height = element.offsetHeight * camera.zoom;
    this.chrome.updateSelectionToolbar({
      color: card.color,
      rect: {
        left,
        top,
        right: left + width,
        bottom: top + height,
      },
      viewport: this.viewport,
    });
  }

  private animateCamera(target: Camera, durationMs: number): void {
    this.cancelCameraAnimation();
    if (prefersReducedMotion() || durationMs <= 0) {
      this.store.setCamera(target);
      return;
    }

    const start = this.store.getCamera();
    const startedAt = performance.now();

    const frame = (now: number): void => {
      const elapsed = Math.min(1, (now - startedAt) / durationMs);
      const t = easeOutCubic(elapsed);
      this.store.setCamera({
        x: start.x + (target.x - start.x) * t,
        y: start.y + (target.y - start.y) * t,
        zoom: start.zoom + (target.zoom - start.zoom) * t,
      });
      if (elapsed < 1) {
        this.cameraFrame = requestAnimationFrame(frame);
      } else {
        this.cameraFrame = 0;
      }
    };

    this.cameraFrame = requestAnimationFrame(frame);
  }

  private cancelCameraAnimation(): void {
    if (this.cameraFrame !== 0) {
      cancelAnimationFrame(this.cameraFrame);
      this.cameraFrame = 0;
    }
  }
}
