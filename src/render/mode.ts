export const RENDER_MODES = ['auto', 'canvas', 'dom'] as const;

export type RequestedRenderMode = (typeof RENDER_MODES)[number];
export type RenderMode = 'canvas' | 'dom';

export interface ModeCapabilities {
  readonly canvas: boolean;
}

export interface RenderModeResolution {
  readonly requested: RequestedRenderMode;
  readonly mode: RenderMode;
  /** True when the URL asked for canvas and the capability probe said no. */
  readonly forcedFallback: boolean;
}

export function parseRenderModeParam(value: string | null): RequestedRenderMode {
  return value === 'canvas' || value === 'dom' || value === 'auto' ? value : 'auto';
}

export function resolveRenderMode(
  requested: RequestedRenderMode,
  capabilities: ModeCapabilities,
): RenderModeResolution {
  if (requested === 'dom') {
    return { requested, mode: 'dom', forcedFallback: false };
  }

  if (capabilities.canvas) {
    return { requested, mode: 'canvas', forcedFallback: false };
  }

  return {
    requested,
    mode: 'dom',
    forcedFallback: requested === 'canvas',
  };
}
