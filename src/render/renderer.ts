import type { Camera, WorldBounds } from '../camera/camera';
import type { Card } from '../store/types';
import type { RenderMode } from './mode';

export interface RendererMountState {
  readonly cards: readonly Card[];
  readonly camera: Camera;
  readonly selectedId: string | null;
}

export interface RendererOptions {
  /** Renderer-owned mount point inside the board surface. */
  readonly container: HTMLElement;
  /** Called once when the primary path can no longer draw. */
  readonly onRuntimeError?: (error: unknown) => void;
}

/**
 * The only surface the app knows about. Both renderers implement it, and all
 * HTML-in-Canvas API contact stays inside the canvas renderer.
 */
export interface Renderer {
  readonly kind: RenderMode;
  mount(state: RendererMountState): void;
  setCamera(camera: Camera): void;
  syncCards(cards: readonly Card[], selectedId: string | null): void;
  syncCard(card: Card): void;
  setSelection(selectedId: string | null): void;
  getWorldBounds(): WorldBounds | null;
  invalidate(): void;
  destroy(): void;
}
