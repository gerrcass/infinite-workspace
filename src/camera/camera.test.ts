import { describe, expect, it } from 'vitest';
import {
  EDIT_ASSIST_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  REVEAL_MIN_ZOOM,
  cameraCenteredOn,
  clampZoom,
  editingAssistCamera,
  revealBoundsCamera,
  fitBounds,
  initialCamera,
  panBy,
  screenToWorld,
  visibleWorldBounds,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera';

const viewport = { width: 1440, height: 900 };

const cameras: Camera[] = [
  { x: 0, y: 0, zoom: 1 },
  { x: -1234.5, y: 987.25, zoom: 0.37 },
  { x: 6400, y: -2200, zoom: 2.4 },
  { x: -42, y: -42, zoom: 0.15 },
];

const points = [
  { x: 0, y: 0 },
  { x: 720, y: 450 },
  { x: -640, y: 1280 },
  { x: 1599.5, y: -33.25 },
];

describe('camera', () => {
  it('round-trips screen and world coordinates at every zoom', () => {
    for (const camera of cameras) {
      for (const point of points) {
        const roundTrip = worldToScreen(camera, screenToWorld(camera, point));
        expect(roundTrip.x).toBeCloseTo(point.x, 10);
        expect(roundTrip.y).toBeCloseTo(point.y, 10);
      }
    }
  });

  it('keeps the world point under the pointer fixed when zooming', () => {
    for (const camera of cameras) {
      for (const anchor of points) {
        const before = screenToWorld(camera, anchor);
        const zoomed = zoomAt(camera, anchor, camera.zoom * 1.9);
        const after = screenToWorld(zoomed, anchor);
        expect(after.x).toBeCloseTo(before.x, 8);
        expect(after.y).toBeCloseTo(before.y, 8);
      }
    }
  });

  it('clamps zoom at both ends without breaking the anchor invariant', () => {
    const camera: Camera = { x: 120, y: -90, zoom: 0.5 };
    const anchor = { x: 300, y: 220 };
    const before = screenToWorld(camera, anchor);

    const tooFar = zoomAt(camera, anchor, 99);
    expect(tooFar.zoom).toBe(MAX_ZOOM);
    expect(screenToWorld(tooFar, anchor).x).toBeCloseTo(before.x, 8);

    const tooClose = zoomAt(camera, anchor, 0.00001);
    expect(tooClose.zoom).toBe(MIN_ZOOM);
    expect(screenToWorld(tooClose, anchor).y).toBeCloseTo(before.y, 8);

    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(-4)).toBe(MIN_ZOOM);
  });

  it('pans content by the pointer delta', () => {
    for (const camera of cameras) {
      const before = worldToScreen(camera, { x: 100, y: -250 });
      const panned = panBy(camera, 120, -35);
      const after = worldToScreen(panned, { x: 100, y: -250 });
      expect(after.x).toBeCloseTo(before.x + 120, 10);
      expect(after.y).toBeCloseTo(before.y - 35, 10);
      expect(panned.zoom).toBe(camera.zoom);
    }
  });

  it('fits bounds inside the padded viewport and centres them', () => {
    const bounds = { minX: -1800, minY: -1200, maxX: 2400, maxY: 1600 };
    const camera = fitBounds(bounds, viewport, 80);
    const visible = visibleWorldBounds(camera, viewport);

    expect(visible.minX).toBeLessThanOrEqual(bounds.minX);
    expect(visible.minY).toBeLessThanOrEqual(bounds.minY);
    expect(visible.maxX).toBeGreaterThanOrEqual(bounds.maxX);
    expect(visible.maxY).toBeGreaterThanOrEqual(bounds.maxY);
    expect(camera.zoom).toBeGreaterThan(MIN_ZOOM);
    expect(camera.zoom).toBeLessThanOrEqual(MAX_ZOOM);

    const boundsCenter = { x: 300, y: 200 };
    const screenCenter = worldToScreen(camera, boundsCenter);
    expect(screenCenter.x).toBeCloseTo(viewport.width / 2, 8);
    expect(screenCenter.y).toBeCloseTo(viewport.height / 2, 8);
  });

  it('keeps an oversized board centred at the minimum zoom', () => {
    const bounds = { minX: -20000, minY: -10000, maxX: 20000, maxY: 10000 };
    const camera = fitBounds(bounds, viewport, 80);
    expect(camera.zoom).toBe(MIN_ZOOM);
    const center = worldToScreen(camera, { x: 0, y: 0 });
    expect(center.x).toBeCloseTo(viewport.width / 2, 8);
    expect(center.y).toBeCloseTo(viewport.height / 2, 8);
  });

  it('computes visible bounds in world space', () => {
    const camera: Camera = { x: -500, y: 250, zoom: 0.5 };
    const visible = visibleWorldBounds(camera, viewport);
    expect(visible).toEqual({
      minX: -500,
      minY: 250,
      maxX: 2380,
      maxY: 2050,
    });
  });

  it('centres a world point at an exact zoom', () => {
    const point = { x: 1234, y: -567 };
    const camera = cameraCenteredOn(point, viewport, 0.5);
    const screen = worldToScreen(camera, point);
    expect(camera.zoom).toBe(0.5);
    expect(screen.x).toBeCloseTo(viewport.width / 2, 8);
    expect(screen.y).toBeCloseTo(viewport.height / 2, 8);
  });

  it('assists editing only below the comfort threshold and centres the card', () => {
    const point = { x: -800, y: 640 };
    const close = editingAssistCamera({ x: 0, y: 0, zoom: 0.72 }, viewport, point);
    expect(close).toBeNull();

    const assisted = editingAssistCamera({ x: 0, y: 0, zoom: 0.3 }, viewport, point);
    expect(assisted).not.toBeNull();
    if (!assisted) {
      return;
    }
    expect(assisted.zoom).toBe(EDIT_ASSIST_ZOOM);
    const screen = worldToScreen(assisted, point);
    expect(screen.x).toBeCloseTo(viewport.width / 2, 8);
    expect(screen.y).toBeCloseTo(viewport.height / 2, 8);
  });

  it('opens on a readable slice rather than the whole board', () => {
    const camera = initialCamera(viewport);
    expect(camera.zoom).toBeGreaterThan(0.6);
    expect(camera.zoom).toBeLessThan(1);
    expect(Number.isFinite(camera.x)).toBe(true);
    expect(Number.isFinite(camera.y)).toBe(true);

    const narrow = initialCamera({ width: 390, height: 844 });
    expect(narrow.zoom).toBeGreaterThanOrEqual(0.75);
    expect(narrow.zoom).toBeLessThanOrEqual(1);
    expect(Number.isFinite(narrow.x)).toBe(true);

    const medium = initialCamera({ width: 820, height: 1100 });
    expect(medium.zoom).toBe(0.6);
    expect(Number.isFinite(medium.x)).toBe(true);
  });
});

describe('revealBoundsCamera', () => {
  const viewport = { width: 1440, height: 900 };
  const bounds = { minX: 4000, minY: 3000, maxX: 4260, maxY: 3160 };

  it('returns a camera that centres an off-screen card and raises zoom to readable', () => {
    const camera = { x: 0, y: 0, zoom: 0.4 };
    const target = revealBoundsCamera(camera, viewport, bounds);
    expect(target).not.toBeNull();
    expect(target!.zoom).toBeGreaterThanOrEqual(REVEAL_MIN_ZOOM);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    expect(target!.x + viewport.width / (2 * target!.zoom)).toBeCloseTo(centerX, 5);
  });

  it('does not move when the card is already comfortably visible', () => {
    const camera = revealBoundsCamera({ x: 0, y: 0, zoom: 0.4 }, viewport, bounds)!;
    expect(revealBoundsCamera(camera, viewport, bounds)).toBeNull();
  });

  it('zooms out when a tall card cannot fit at the current zoom', () => {
    const tall = { minX: 0, minY: 0, maxX: 280, maxY: 3000 };
    const target = revealBoundsCamera({ x: 0, y: 0, zoom: 2 }, viewport, tall)!;
    expect(target.zoom).toBeLessThan(2);
    expect(target.zoom * 3000).toBeLessThanOrEqual(viewport.height);
  });
});
