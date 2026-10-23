/**
 * Pure camera math for the board.
 *
 * A camera is the world coordinate at the viewport's top-left corner plus a
 * zoom factor. Screen = (world - camera) * zoom. Nothing in this module
 * touches the DOM.
 */

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface WorldBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;

const INITIAL_VIEW_WIDTH = 2000;
const INITIAL_VIEW_HEIGHT = 1250;
const INITIAL_CENTER = { x: 850, y: 500 } as const;
const NARROW_INITIAL_CENTER = { x: 1430, y: 440 } as const;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(camera: Camera, point: Point): Point {
  return {
    x: camera.x + point.x / camera.zoom,
    y: camera.y + point.y / camera.zoom,
  };
}

export function worldToScreen(camera: Camera, point: Point): Point {
  return {
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom,
  };
}

/** Move the content by a screen-space delta, as if the pointer dragged it. */
export function panBy(camera: Camera, screenDx: number, screenDy: number): Camera {
  return {
    x: camera.x - screenDx / camera.zoom,
    y: camera.y - screenDy / camera.zoom,
    zoom: camera.zoom,
  };
}

/** Zoom while keeping the world point under `anchor` fixed on screen. */
export function zoomAt(camera: Camera, anchor: Point, requestedZoom: number): Camera {
  const zoom = clampZoom(requestedZoom);
  const worldAnchor = screenToWorld(camera, anchor);
  return {
    x: worldAnchor.x - anchor.x / zoom,
    y: worldAnchor.y - anchor.y / zoom,
    zoom,
  };
}

/** Zoom around the viewport centre, used by buttons and the keyboard. */
export function zoomAtCenter(
  camera: Camera,
  viewport: ViewportSize,
  requestedZoom: number,
): Camera {
  return zoomAt(camera, { x: viewport.width / 2, y: viewport.height / 2 }, requestedZoom);
}

export function cameraCenterWorld(camera: Camera, viewport: ViewportSize): Point {
  return screenToWorld(camera, { x: viewport.width / 2, y: viewport.height / 2 });
}

export function visibleWorldBounds(camera: Camera, viewport: ViewportSize): WorldBounds {
  const topLeft = screenToWorld(camera, { x: 0, y: 0 });
  const bottomRight = screenToWorld(camera, { x: viewport.width, y: viewport.height });
  return {
    minX: topLeft.x,
    minY: topLeft.y,
    maxX: bottomRight.x,
    maxY: bottomRight.y,
  };
}

/**
 * Frame world bounds in the viewport with breathing room. When the board is
 * larger than the minimum zoom can show, the board stays centred instead of
 * clamping to a corner.
 */
export function fitBounds(bounds: WorldBounds, viewport: ViewportSize, padding = 80): Camera {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const zoom = clampZoom(Math.min(availableWidth / width, availableHeight / height));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: centerX - viewport.width / (2 * zoom),
    y: centerY - viewport.height / (2 * zoom),
    zoom,
  };
}

/**
 * The opening view: a readable slice of the central launch wall, not the whole
 * 216-card board scaled down to confetti. Narrow viewports centre the welcome
 * card instead so the first screen still says something.
 */
export function initialCamera(viewport: ViewportSize): Camera {
  const narrow = viewport.width < 760;
  const center = narrow ? NARROW_INITIAL_CENTER : INITIAL_CENTER;
  const widthLimiter = viewport.width / INITIAL_VIEW_WIDTH;
  const heightLimiter = viewport.height / INITIAL_VIEW_HEIGHT;
  const rawZoom = Math.min(widthLimiter, heightLimiter);
  const zoom = narrow
    ? clampZoom(Math.min(1, Math.max(0.75, viewport.height / 1050)))
    : clampZoom(Math.min(0.95, Math.max(0.6, rawZoom)));

  return {
    x: center.x - viewport.width / (2 * zoom),
    y: center.y - viewport.height / (2 * zoom),
    zoom,
  };
}

export function cameraEquals(a: Camera, b: Camera): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

export function isFiniteCamera(camera: Camera): boolean {
  return (
    Number.isFinite(camera.x) &&
    Number.isFinite(camera.y) &&
    Number.isFinite(camera.zoom) &&
    camera.zoom > 0
  );
}
