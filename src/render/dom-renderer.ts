import type { Camera, WorldBounds } from '../camera/camera';
import type { Card } from '../store/types';
import { CardLayer } from './card-layer';
import type { Renderer, RendererMountState, RendererOptions } from './renderer';

/**
 * The complete fallback renderer. Cards live in a world layer that is moved
 * with a CSS transform; their DOM is the same as the canvas renderer's.
 */
export class DomRenderer implements Renderer {
  readonly kind = 'dom' as const;

  private readonly world: HTMLDivElement;
  private readonly layer: CardLayer;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };

  constructor(private readonly options: RendererOptions) {
    this.world = document.createElement('div');
    this.world.className = 'board-world';
    this.world.dataset.renderer = 'dom';
    this.layer = new CardLayer(this.world);
  }

  mount(state: RendererMountState): void {
    this.options.container.append(this.world);
    this.layer.mount(state.cards, state.selectedId);
    this.camera = state.camera;
    this.applyCamera();
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
    this.applyCamera();
  }

  syncCards(cards: readonly Card[], selectedId: string | null): void {
    this.layer.sync(cards, selectedId);
  }

  syncCard(card: Card): void {
    this.layer.syncCard(card);
  }

  setSelection(selectedId: string | null): void {
    this.layer.setSelection(selectedId);
  }

  getWorldBounds(): WorldBounds | null {
    return this.layer.getWorldBounds();
  }

  invalidate(): void {
    // DOM layout is continuous; there is no cached paint to flush.
  }

  destroy(): void {
    this.layer.destroy();
    this.world.remove();
  }

  private applyCamera(): void {
    const { x, y, zoom } = this.camera;
    this.world.style.transform = `translate(${-x * zoom}px, ${-y * zoom}px) scale(${zoom})`;
    this.world.style.setProperty('--board-zoom', String(zoom));
  }
}
