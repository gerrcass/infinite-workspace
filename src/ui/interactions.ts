import { panBy, zoomAt, type Camera, type Point, type ViewportSize } from '../camera/camera';

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
}

interface PanSession {
  readonly pointerId: number;
  lastX: number;
  lastY: number;
}

const WHEEL_ZOOM_SPEED = 0.0022;

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

  const localPoint = (event: MouseEvent | WheelEvent): Point => {
    const rect = surface.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const onCard = target.closest('[data-card-id]') !== null;
    const onChrome = target.closest('.chrome') !== null;
    if (onChrome) {
      return;
    }

    const middleButton = event.button === 1;
    if (onCard && !middleButton) {
      return;
    }

    pan = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    surface.setPointerCapture(event.pointerId);
    surface.classList.add('is-panning');
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - pan.lastX;
    const dy = event.clientY - pan.lastY;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;

    if (dx !== 0 || dy !== 0) {
      handlers.onCamera(panBy(handlers.getCamera(), dx, dy));
    }
  };

  const endPan = (event: PointerEvent): void => {
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }
    pan = null;
    surface.classList.remove('is-panning');
    if (surface.hasPointerCapture(event.pointerId)) {
      surface.releasePointerCapture(event.pointerId);
    }
  };

  const onClick = (event: MouseEvent): void => {
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
    if (
      event.key === 'Escape' &&
      event.target instanceof HTMLElement &&
      isEditableTarget(event.target)
    ) {
      event.preventDefault();
      event.target.blur();
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    if (document.querySelector('dialog[open]')) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
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
      default:
        break;
    }
  };

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', endPan);
  surface.addEventListener('pointercancel', endPan);
  surface.addEventListener('click', onClick);
  surface.addEventListener('focusin', onFocusIn);
  surface.addEventListener('focusout', onFocusOut);
  surface.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);

  return () => {
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', endPan);
    surface.removeEventListener('pointercancel', endPan);
    surface.removeEventListener('click', onClick);
    surface.removeEventListener('focusin', onFocusIn);
    surface.removeEventListener('focusout', onFocusOut);
    surface.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    surface.classList.remove('is-panning');
  };
}
