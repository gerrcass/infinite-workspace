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

export const EDIT_ASSIST_BELOW_ZOOM = 0.7;
export const EDIT_ASSIST_ZOOM = 0.85;

/** Centre the viewport on a world point at an exact, clamped zoom. */
export function cameraCenteredOn(
  worldPoint: Point,
  viewport: ViewportSize,
  requestedZoom: number,
): Camera {
  const zoom = clampZoom(requestedZoom);
  return {
    x: worldPoint.x - viewport.width / (2 * zoom),
    y: worldPoint.y - viewport.height / (2 * zoom),
    zoom,
  };
}

/**
 * A one-shot camera assist for editing text. Below the comfort threshold the
 * view eases to at least 0.85x around the card; otherwise nothing changes.
 */
export function editingAssistCamera(
  camera: Camera,
  viewport: ViewportSize,
  worldCenter: Point,
): Camera | null {
  if (camera.zoom >= EDIT_ASSIST_BELOW_ZOOM) {
    return null;
  }
  return cameraCenteredOn(worldCenter, viewport, Math.max(camera.zoom, EDIT_ASSIST_ZOOM));
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
  const narrow = viewport.width < 600;
  const medium = !narrow && viewport.width < 1100;

  if (medium) {
    // Portrait tablets need density more than a hero card: hold 0.6x on the
    // seam between the launch wall and the welcome card so both are in frame.
    return cameraCenteredOn({ x: 1000, y: 500 }, viewport, 0.6);
  }

  const center = narrow ? NARROW_INITIAL_CENTER : INITIAL_CENTER;
  const widthLimiter = viewport.width / INITIAL_VIEW_WIDTH;
  const heightLimiter = viewport.height / INITIAL_VIEW_HEIGHT;
  const rawZoom = Math.min(widthLimiter, heightLimiter);
  const zoom = narrow
    ? clampZoom(Math.min(1, Math.max(0.8, viewport.height / 1050)))
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

/** Breathing room kept around a native-find match when revealing it. */
export const REVEAL_INSET = 72;
export const REVEAL_MIN_ZOOM = 0.55;
const REVEAL_TOP_INSET = 118;
const REVEAL_BOTTOM_INSET = 96;

/**
 * Camera move that makes a card containing a native-find match comfortable to
 * read. Returns null when the card is already inside the usable viewport at a
 * readable zoom. The camera only zooms in to the reveal minimum, and zooms out
 * when the card would not otherwise fit.
 */
export function revealBoundsCamera(
  camera: Camera,
  viewport: ViewportSize,
  bounds: WorldBounds,
): Camera | null {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, viewport.width - REVEAL_INSET * 2);
  const availableHeight = Math.max(1, viewport.height - REVEAL_TOP_INSET - REVEAL_BOTTOM_INSET);
  const fitZoom = Math.min(availableWidth / width, availableHeight / height);
  const desiredZoom = clampZoom(Math.min(Math.max(camera.zoom, REVEAL_MIN_ZOOM), fitZoom));

  const left = (bounds.minX - camera.x) * camera.zoom;
  const top = (bounds.minY - camera.y) * camera.zoom;
  const right = (bounds.maxX - camera.x) * camera.zoom;
  const bottom = (bounds.maxY - camera.y) * camera.zoom;
  const alreadyVisible =
    camera.zoom >= REVEAL_MIN_ZOOM &&
    left >= REVEAL_INSET &&
    right <= viewport.width - REVEAL_INSET &&
    top >= REVEAL_TOP_INSET &&
    bottom <= viewport.height - REVEAL_BOTTOM_INSET;

  if (alreadyVisible) {
    return null;
  }

  return cameraCenteredOn(
    { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    viewport,
    desiredZoom,
  );
}
