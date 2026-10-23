import type { Camera, WorldBounds } from '../camera/camera';
import { CARD_WIDTHS, type Card } from '../store/types';
import { CardLayer } from './card-layer';
import type { Renderer, RendererMountState, RendererOptions } from './renderer';

interface HtmlInCanvasContext extends CanvasRenderingContext2D {
  drawElementImage(
    element: Element,
    dx: number,
    dy: number,
    destinationWidth?: number,
    destinationHeight?: number,
  ): void;
}

interface PainstableCanvas extends HTMLCanvasElement {
  requestPaint(): void;
  onpaint: ((event: Event) => void) | null;
}

/**
 * Detect the experimental HTML-in-Canvas capability. This is the only module
 * allowed to name these APIs; the rest of the app sees the Renderer contract.
 */
export function detectCanvasSupport(): boolean {
  if (typeof HTMLCanvasElement === 'undefined' || typeof CanvasRenderingContext2D === 'undefined') {
    return false;
  }

  return (
    'drawElementImage' in CanvasRenderingContext2D.prototype &&
    'requestPaint' in HTMLCanvasElement.prototype
  );
}

export class CanvasRenderer implements Renderer {
  readonly kind = 'canvas' as const;

  private readonly canvas: PainstableCanvas;
  private readonly context: HtmlInCanvasContext;
  private readonly layer: CardLayer;
  private readonly resizeObserver: ResizeObserver;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private frameId = 0;
  private failed = false;
  private destroyed = false;
  private mounted = false;

  constructor(private readonly options: RendererOptions) {
    this.canvas = document.createElement('canvas') as PainstableCanvas;
    this.canvas.setAttribute('content', 'drawable');
    this.canvas.setAttribute('layoutsubtree', '');
    this.canvas.className = 'board-canvas';
    this.canvas.setAttribute('role', 'group');
    this.canvas.setAttribute('aria-label', 'Project board cards');
    this.canvas.addEventListener('change', this.handleDomControlChange);
    this.canvas.addEventListener('input', this.handleDomControlChange);

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is unavailable');
    }
    this.context = context as HtmlInCanvasContext;

    this.canvas.onpaint = this.handlePaint;
    this.layer = new CardLayer(this.canvas, {
      onCardResize: () => this.schedulePaint(),
      decorate: (element) => {
        element.setAttribute('drawable', '');
      },
    });

    const supportsDevicePixelBox =
      typeof ResizeObserverEntry !== 'undefined' &&
      'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;

    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        this.handleResize(entry);
      }
    });
    this.resizeObserver.observe(
      this.canvas,
      supportsDevicePixelBox ? { box: 'device-pixel-content-box' } : { box: 'content-box' },
    );
  }

  mount(state: RendererMountState): void {
    if (this.destroyed) {
      return;
    }

    this.options.container.append(this.canvas);
    this.mounted = true;
    this.measureFromRect();
    this.layer.mount(state.cards, state.selectedId);
    this.camera = state.camera;
    this.schedulePaint();
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
    this.schedulePaint();
  }

  syncCards(cards: readonly Card[], selectedId: string | null): void {
    this.layer.sync(cards, selectedId);
    this.schedulePaint();
  }

  syncCard(card: Card): void {
    this.layer.syncCard(card);
    this.schedulePaint();
  }

  setSelection(selectedId: string | null): void {
    this.layer.setSelection(selectedId);
    this.schedulePaint();
  }

  getWorldBounds(): WorldBounds | null {
    return this.layer.getWorldBounds();
  }

  invalidate(): void {
    this.schedulePaint();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.frameId !== 0) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
    this.resizeObserver.disconnect();
    this.layer.destroy();
    this.canvas.removeEventListener('change', this.handleDomControlChange);
    this.canvas.removeEventListener('input', this.handleDomControlChange);
    this.canvas.onpaint = null;
    this.canvas.remove();
  }

  private measureFromRect(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = Math.max(1, rect.width);
    this.cssHeight = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(this.cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(this.cssHeight * dpr));
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.dpr = pixelWidth / this.cssWidth;
  }

  private handleResize(entry: ResizeObserverEntry): void {
    const deviceSize = entry.devicePixelContentBoxSize[0];
    const cssWidth = Math.max(1, entry.contentRect.width);
    const cssHeight = Math.max(1, entry.contentRect.height);
    const dpr = window.devicePixelRatio || 1;
    // devicePixelContentBoxSize is authoritative when it is honest. Headless
    // Chrome's DPR emulation can report CSS pixels here, so never allocate a
    // backing store smaller than CSS size * DPR.
    const pixelWidth = Math.max(1, deviceSize?.inlineSize ?? 0, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, deviceSize?.blockSize ?? 0, Math.round(cssHeight * dpr));

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.dpr = pixelWidth / cssWidth;
    }

    this.schedulePaint();
  }

  private schedulePaint(): void {
    if (!this.mounted || this.failed || this.destroyed || this.frameId !== 0) {
      return;
    }

    this.frameId = requestAnimationFrame(() => {
      this.frameId = 0;
      if (this.failed || this.destroyed) {
        return;
      }
      try {
        this.canvas.requestPaint();
      } catch (error) {
        this.fail(error);
      }
    });
  }

  private readonly handleDomControlChange = (): void => {
    this.schedulePaint();
  };

  private readonly handlePaint = (): void => {
    if (this.failed || this.destroyed) {
      return;
    }

    try {
      const context = this.context;
      context.reset();
      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      context.clearRect(0, 0, this.cssWidth, this.cssHeight);
      context.imageSmoothingQuality = 'high';

      const { x, y, zoom } = this.camera;
      for (const { card, element } of this.layer.orderedByZ()) {
        const height = element.offsetHeight;
        if (height <= 0) {
          continue;
        }

        context.drawElementImage(
          element,
          (card.x - x) * zoom,
          (card.y - y) * zoom,
          CARD_WIDTHS[card.width] * zoom,
          height * zoom,
        );
      }
    } catch (error) {
      this.fail(error);
    }
  };

  private fail(error: unknown): void {
    if (this.failed) {
      return;
    }
    this.failed = true;
    if (this.frameId !== 0) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
    this.options.onRuntimeError?.(error);
  }
}
