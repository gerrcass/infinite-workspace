import {
  clampZoom,
  panBy,
  screenToWorld,
  zoomAt,
  type Camera,
  type Point,
  type ViewportSize,
} from '../camera/camera';

export interface DragOrigin {
  readonly x: number;
  readonly y: number;
}

export interface InteractionHandlers {
  readonly getCamera: () => Camera;
  readonly getViewport: () => ViewportSize;
  readonly onCamera: (camera: Camera) => void;
  readonly onSelect: (cardId: string | null) => void;
  readonly onAddNote: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onResetZoom: () => void;
  readonly onFit: () => void;
  readonly onHelp: () => void;
  readonly onEditableFocus: (cardId: string) => void;
  readonly onEditableBlur: () => void;
  readonly onDeleteSelected: () => void;
  readonly onDuplicateSelected: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onEscape: () => void;
  readonly onCardDragStart: (cardId: string) => DragOrigin | null;
  readonly onCardDragMove: (cardId: string, x: number, y: number) => void;
  readonly onCardDragEnd: (moved: boolean) => void;
}

interface PanSession {
  readonly pointerId: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocityX: number;
  velocityY: number;
}

interface PinchSession {
  readonly startCamera: Camera;
  readonly startMidpoint: Point;
  readonly startDistance: number;
}

interface CardDragSession {
  readonly pointerId: number;
  readonly cardId: string;
  readonly startX: number;
  readonly startY: number;
  readonly origin: DragOrigin;
  readonly zoom: number;
  moved: boolean;
}

const WHEEL_ZOOM_SPEED = 0.0022;
const DRAG_THRESHOLD = 3;
const ARROW_PAN = 80;
const ARROW_PAN_FAST = 240;
const INERTIA_MIN_SPEED = 0.08;
const INERTIA_DECAY = 0.93;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function isTextInput(target: HTMLElement): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'range'].includes(
      target.type,
    );
  }
  return false;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || isTextInput(target);
}

/** Buttons, fields, and links keep their native pointer and keyboard behavior. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    isEditableTarget(target) ||
    target.closest('button, input, textarea, select, a, [role="button"]') !== null
  );
}

function normalizeWheelDelta(value: number, mode: number, viewport: ViewportSize): number {
  if (mode === 1) {
    return value * 16;
  }
  if (mode === 2) {
    return value * viewport.height;
  }
  return value;
}

/**
 * Pointer, wheel, keyboard, and selection gestures for both renderers. The
 * surface is the board, not the scene: renderers are free to replace their
 * entire subtree without rebinding gestures.
 */
export function attachInteractions(
  surface: HTMLElement,
  handlers: InteractionHandlers,
): () => void {
  let pan: PanSession | null = null;
  let cardDrag: CardDragSession | null = null;
  let pinch: PinchSession | null = null;
  let spaceHeld = false;
  let suppressClick = false;
  let inertiaFrame = 0;
  let inertiaX = 0;
  let inertiaY = 0;
  const touchPointers = new Map<number, Point>();

  const localPoint = (event: MouseEvent | WheelEvent): Point => {
    const rect = surface.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const stopInertia = (): void => {
    if (inertiaFrame !== 0) {
      cancelAnimationFrame(inertiaFrame);
      inertiaFrame = 0;
    }
    inertiaX = 0;
    inertiaY = 0;
  };

  const startInertia = (velocityX: number, velocityY: number): void => {
    if (prefersReducedMotion() || Math.hypot(velocityX, velocityY) < INERTIA_MIN_SPEED) {
      return;
    }

    stopInertia();
    inertiaX = velocityX;
    inertiaY = velocityY;
    let last = performance.now();

    const frame = (now: number): void => {
      const dt = Math.min(32, Math.max(1, now - last));
      last = now;
      const decay = Math.pow(INERTIA_DECAY, dt / 16.67);
      inertiaX *= decay;
      inertiaY *= decay;
      handlers.onCamera(panBy(handlers.getCamera(), inertiaX * dt, inertiaY * dt));

      if (Math.hypot(inertiaX, inertiaY) > INERTIA_MIN_SPEED * 0.35) {
        inertiaFrame = requestAnimationFrame(frame);
      } else {
        inertiaFrame = 0;
      }
    };

    inertiaFrame = requestAnimationFrame(frame);
  };

  const beginPinch = (): void => {
    const points = [...touchPointers.values()];
    const first = points[0];
    const second = points[1];
    if (!first || !second) {
      return;
    }

    stopInertia();
    if (cardDrag) {
      const moved = cardDrag.moved;
      cardDrag = null;
      handlers.onCardDragEnd(moved);
      surface.classList.remove('is-card-dragging');
    }
    if (pan) {
      pan = null;
      surface.classList.remove('is-panning');
    }
    pinch = {
      startCamera: handlers.getCamera(),
      startMidpoint: midpoint(first, second),
      startDistance: Math.max(1, distance(first, second)),
    };
    surface.classList.add('is-pinching');
  };

  const endPinch = (): void => {
    if (!pinch) {
      return;
    }
    pinch = null;
    surface.classList.remove('is-pinching');
    suppressClick = true;
  };

  const startPan = (event: PointerEvent): void => {
    const now = performance.now();
    pan = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: now,
      velocityX: 0,
      velocityY: 0,
    };
    surface.setPointerCapture(event.pointerId);
    surface.classList.add('is-panning');
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    if (document.querySelector('dialog[open]')) {
      return;
    }

    stopInertia();

    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.chrome')) {
      return;
    }

    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size === 2) {
        beginPinch();
        event.preventDefault();
        return;
      }
      if (pinch) {
        return;
      }
    }

    if (cardDrag || pan) {
      return;
    }
    suppressClick = false;

    if (event.button === 1) {
      startPan(event);
      return;
    }

    if (spaceHeld) {
      startPan(event);
      return;
    }

    const card = target.closest<HTMLElement>('[data-card-id]');
    if (!card) {
      startPan(event);
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (!target.closest('[data-drag-strip]')) {
      return;
    }

    const cardId = card.dataset.cardId;
    if (!cardId) {
      return;
    }
    const origin = handlers.onCardDragStart(cardId);
    if (!origin) {
      return;
    }

    // Starting a drag ends any text session and leaves the caret behind.
    if (document.activeElement instanceof HTMLElement && isEditableTarget(document.activeElement)) {
      document.activeElement.blur();
    }

    cardDrag = {
      pointerId: event.pointerId,
      cardId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      zoom: handlers.getCamera().zoom,
      moved: false,
    };
    surface.setPointerCapture(event.pointerId);
    surface.classList.add('is-card-dragging');
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (
      (event.pointerType === 'touch' || event.pointerType === 'pen') &&
      touchPointers.has(event.pointerId)
    ) {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinch && touchPointers.size >= 2) {
      const points = [...touchPointers.values()];
      const first = points[0];
      const second = points[1];
      if (!first || !second) {
        return;
      }
      const rect = surface.getBoundingClientRect();
      const currentMidpoint = midpoint(first, second);
      const localMidpoint = {
        x: currentMidpoint.x - rect.left,
        y: currentMidpoint.y - rect.top,
      };
      const startLocalMidpoint = {
        x: pinch.startMidpoint.x - rect.left,
        y: pinch.startMidpoint.y - rect.top,
      };
      const scale = distance(first, second) / pinch.startDistance;
      const zoom = clampZoom(pinch.startCamera.zoom * scale);
      const anchor = screenToWorld(pinch.startCamera, startLocalMidpoint);
      handlers.onCamera({
        x: anchor.x - localMidpoint.x / zoom,
        y: anchor.y - localMidpoint.y / zoom,
        zoom,
      });
      event.preventDefault();
      return;
    }

    if (cardDrag && cardDrag.pointerId === event.pointerId) {
      const dx = event.clientX - cardDrag.startX;
      const dy = event.clientY - cardDrag.startY;
      if (!cardDrag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        cardDrag.moved = true;
      }
      if (cardDrag.moved) {
        handlers.onCardDragMove(
          cardDrag.cardId,
          cardDrag.origin.x + dx / cardDrag.zoom,
          cardDrag.origin.y + dy / cardDrag.zoom,
        );
      }
      return;
    }

    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }

    const now = performance.now();
    const dt = Math.max(1, now - pan.lastTime);
    const dx = event.clientX - pan.lastX;
    const dy = event.clientY - pan.lastY;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    pan.lastTime = now;
    // Smoothed screen-space velocity in px/ms for the inertia tail.
    pan.velocityX = pan.velocityX * 0.7 + (dx / dt) * 0.3;
    pan.velocityY = pan.velocityY * 0.7 + (dy / dt) * 0.3;

    if (dx !== 0 || dy !== 0) {
      handlers.onCamera(panBy(handlers.getCamera(), dx, dy));
    }
  };

  const endGesture = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      touchPointers.delete(event.pointerId);
      if (pinch) {
        if (surface.hasPointerCapture(event.pointerId)) {
          surface.releasePointerCapture(event.pointerId);
        }
        if (touchPointers.size < 2) {
          endPinch();
        }
        if (touchPointers.size === 1) {
          const remaining = [...touchPointers.entries()][0];
          if (remaining) {
            const [pointerId, point] = remaining;
            pan = {
              pointerId,
              lastX: point.x,
              lastY: point.y,
              lastTime: performance.now(),
              velocityX: 0,
              velocityY: 0,
            };
          }
        }
        return;
      }
    }

    if (cardDrag && cardDrag.pointerId === event.pointerId) {
      const moved = cardDrag.moved;
      cardDrag = null;
      surface.classList.remove('is-card-dragging');
      if (surface.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId);
      }
      handlers.onCardDragEnd(moved);
      suppressClick = moved;
      return;
    }

    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }
    const velocityX = pan.velocityX;
    const velocityY = pan.velocityY;
    pan = null;
    surface.classList.remove('is-panning');
    if (surface.hasPointerCapture(event.pointerId)) {
      surface.releasePointerCapture(event.pointerId);
    }
    startInertia(velocityX, velocityY);
  };

  const onClick = (event: MouseEvent): void => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.chrome')) {
      return;
    }

    const card = target.closest<HTMLElement>('[data-card-id]');
    handlers.onSelect(card?.dataset.cardId ?? null);
  };

  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !isEditableTarget(target)) {
      return;
    }
    const card = target.closest<HTMLElement>('[data-card-id]');
    if (card?.dataset.cardId) {
      handlers.onEditableFocus(card.dataset.cardId);
    }
  };

  const onFocusOut = (event: FocusEvent): void => {
    if (event.target instanceof HTMLElement && isEditableTarget(event.target)) {
      handlers.onEditableBlur();
    }
  };

  const onWheel = (event: WheelEvent): void => {
    if (event.target instanceof Element && event.target.closest('.chrome')) {
      return;
    }

    stopInertia();
    event.preventDefault();
    const camera = handlers.getCamera();
    const viewport = handlers.getViewport();
    const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode, viewport);
    const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode, viewport);

    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-deltaY * WHEEL_ZOOM_SPEED);
      handlers.onCamera(zoomAt(camera, localPoint(event), camera.zoom * factor));
      return;
    }

    if (event.shiftKey && deltaX === 0) {
      handlers.onCamera(panBy(camera, -deltaY, 0));
      return;
    }

    handlers.onCamera(panBy(camera, -deltaX, -deltaY));
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (document.querySelector('dialog[open]')) {
      return;
    }
    stopInertia();

    const target = event.target;
    if (event.key === 'Escape' && target instanceof HTMLElement && isEditableTarget(target)) {
      event.preventDefault();
      target.blur();
      return;
    }

    if (isEditableTarget(target)) {
      // Ctrl/Cmd+D is a board shortcut; inside text it should do nothing rather
      // than open the browser's bookmark dialog. Native undo/redo still pass.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
      }
      return;
    }

    const interactive = isInteractiveTarget(target);
    const inChrome = target instanceof HTMLElement && target.closest('.chrome') !== null;

    if (event.key === ' ') {
      if (interactive) {
        return;
      }
      event.preventDefault();
      if (!event.repeat) {
        spaceHeld = true;
      }
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handlers.onRedo();
        } else {
          handlers.onUndo();
        }
        return;
      }
      if (key === 'y' && !event.shiftKey) {
        event.preventDefault();
        handlers.onRedo();
        return;
      }
      if (key === 'd' && !event.shiftKey) {
        event.preventDefault();
        handlers.onDuplicateSelected();
      }
      return;
    }

    if (event.altKey) {
      return;
    }

    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        handlers.onZoomIn();
        break;
      case '-':
      case '_':
        event.preventDefault();
        handlers.onZoomOut();
        break;
      case '0':
        event.preventDefault();
        handlers.onFit();
        break;
      case '1':
        event.preventDefault();
        handlers.onResetZoom();
        break;
      case 'n':
      case 'N':
        event.preventDefault();
        handlers.onAddNote();
        break;
      case '?':
        event.preventDefault();
        handlers.onHelp();
        break;
      case 'Escape':
        event.preventDefault();
        handlers.onEscape();
        break;
      case 'Delete':
      case 'Backspace':
        if (isEditableTarget(target)) {
          return;
        }
        event.preventDefault();
        handlers.onDeleteSelected();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        if (interactive || inChrome) {
          return;
        }
        event.preventDefault();
        panWithArrow(event.key, event.shiftKey ? ARROW_PAN_FAST : ARROW_PAN);
        break;
      default:
        break;
    }
  };

  const panWithArrow = (key: string, step: number): void => {
    const camera = handlers.getCamera();
    switch (key) {
      case 'ArrowLeft':
        handlers.onCamera(panBy(camera, step, 0));
        break;
      case 'ArrowRight':
        handlers.onCamera(panBy(camera, -step, 0));
        break;
      case 'ArrowUp':
        handlers.onCamera(panBy(camera, 0, step));
        break;
      case 'ArrowDown':
        handlers.onCamera(panBy(camera, 0, -step));
        break;
      default:
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === ' ') {
      spaceHeld = false;
    }
  };

  const onWindowBlur = (): void => {
    spaceHeld = false;
  };

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', endGesture);
  surface.addEventListener('pointercancel', endGesture);
  surface.addEventListener('click', onClick);
  surface.addEventListener('focusin', onFocusIn);
  surface.addEventListener('focusout', onFocusOut);
  surface.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);

  return () => {
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', endGesture);
    surface.removeEventListener('pointercancel', endGesture);
    surface.removeEventListener('click', onClick);
    surface.removeEventListener('focusin', onFocusIn);
    surface.removeEventListener('focusout', onFocusOut);
    surface.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
    stopInertia();
    touchPointers.clear();
    pinch = null;
    surface.classList.remove('is-panning', 'is-card-dragging', 'is-pinching');
  };
}
