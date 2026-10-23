import {
  fitBounds,
  initialCamera,
  screenToWorld,
  zoomAtCenter,
  type Camera,
  type ViewportSize,
} from './camera/camera';
import { createSeed } from './store/seed';
import { BoardStore } from './store/store';
import { CARD_WIDTHS, type Card } from './store/types';
import { CanvasRenderer, detectCanvasSupport } from './render/canvas-renderer';
import { DomRenderer } from './render/dom-renderer';
import { parseRenderModeParam, resolveRenderMode, type RenderMode } from './render/mode';
import type { Renderer } from './render/renderer';
import { createChrome, type Chrome } from './ui/chrome';
import { attachInteractions } from './ui/interactions';

const MINOR_GRID_WORLD = 20;
const MAJOR_GRID_WORLD = 100;
const FIT_PADDING = 90;

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

/**
 * Composition root: owns the shell, store, renderer choice, camera animation,
 * and the dotted ground. Renderer internals never leak into this file.
 */
export class App {
  private readonly board: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly scene: HTMLElement;
  private readonly store: BoardStore;
  private readonly chrome: Chrome;
  private renderer: Renderer;
  private detachInteractions: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private cameraFrame = 0;
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
      'A board of live HTML cards. Drag empty paper or scroll to pan. Hold Control or Command while scrolling to zoom. Press zero to fit the board and one for 100 percent. Press question mark for help. Use your browser’s native Find command to search real card text.';

    this.grid = element('div', 'board__grid');
    this.grid.setAttribute('aria-hidden', 'true');

    this.scene = element('div', 'scene');
    this.scene.dataset.testid = 'scene';

    this.board.append(this.grid, this.scene, instructions);
    this.root.append(this.board);

    this.viewport = this.measureViewport();
    const seed = createSeed();
    this.store = new BoardStore(seed, initialCamera(this.viewport));

    this.chrome = createChrome({
      onAddNote: () => this.addNote(),
      onZoomIn: () => this.zoomBy(1.2),
      onZoomOut: () => this.zoomBy(1 / 1.2),
      onResetZoom: () => this.resetZoom(),
      onFit: () => this.fitBoard(),
    });
    this.board.append(this.chrome.element);

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
    this.chrome.setSaveState('Session only', 'session');
    this.updateGrid(snapshot.camera);

    this.detachInteractions = attachInteractions(this.board, {
      getCamera: () => this.store.getCamera(),
      getViewport: () => this.viewport,
      onCamera: (camera) => {
        this.cancelCameraAnimation();
        this.store.setCamera(camera);
      },
      onSelect: (cardId) => this.store.select(cardId),
      onAddNote: () => this.addNote(),
      onZoomIn: () => this.zoomBy(1.2),
      onZoomOut: () => this.zoomBy(1 / 1.2),
      onResetZoom: () => this.resetZoom(),
      onFit: () => this.fitBoard(),
      onHelp: () => this.chrome.openHelp(),
    });

    this.unsubscribe = this.store.subscribe((event) => {
      if (event.type === 'camera') {
        this.renderer.setCamera(event.camera);
        this.chrome.setZoom(event.camera.zoom);
        this.updateGrid(event.camera);
      } else if (event.type === 'card') {
        this.renderer.syncCard(event.card);
      } else if (event.type === 'cards') {
        this.renderer.syncCards(event.cards, this.store.getSelectedId());
        this.chrome.setCardCount(event.cards.length);
      } else {
        this.renderer.setSelection(event.selectedId);
      }
    });

    window.addEventListener('resize', this.handleResize);

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
    this.detachInteractions?.();
    this.unsubscribe?.();
    this.renderer.destroy();
    this.chrome.destroy();
    window.removeEventListener('resize', this.handleResize);
    this.board.remove();
  }

  private createRenderer(mode: RenderMode): Renderer {
    if (mode === 'canvas') {
      try {
        return new CanvasRenderer({
          container: this.scene,
          onRuntimeError: (error) => this.handleCanvasFailure(error),
        });
      } catch (error) {
        this.chrome.showToast(
          'The canvas renderer could not start, so the board is using the DOM renderer. Nothing was lost.',
        );
        console.warn('Canvas renderer could not start; using DOM.', error);
      }
    }

    return new DomRenderer({ container: this.scene });
  }

  private handleCanvasFailure(error: unknown): void {
    queueMicrotask(() => {
      if (this.destroyed || this.renderer.kind === 'dom') {
        return;
      }

      const snapshot = this.store.getSnapshot();
      this.renderer.destroy();
      this.renderer = new DomRenderer({ container: this.scene });
      this.renderer.mount({
        cards: snapshot.cards,
        camera: snapshot.camera,
        selectedId: snapshot.selectedId,
      });
      this.chrome.setRenderer('dom', 'Canvas drawing failed; the DOM renderer is active');
      this.chrome.showToast(
        'The canvas renderer hit a drawing error, so the board switched to the DOM renderer. Nothing was lost.',
      );
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
    if (snapshot.cards.length >= 500) {
      this.chrome.showToast('This wall is full at 500 cards. Remove a note before adding another.');
      return;
    }

    const center = screenToWorld(this.store.getCamera(), {
      x: this.viewport.width / 2,
      y: this.viewport.height / 2,
    });
    const card: Card = {
      id: newCardId(),
      x: center.x - CARD_WIDTHS.regular / 2,
      y: center.y - 80,
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
