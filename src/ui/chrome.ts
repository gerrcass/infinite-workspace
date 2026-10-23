import type { RenderMode } from '../render/mode';

export interface ChromeHandlers {
  readonly onAddNote: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onResetZoom: () => void;
  readonly onFit: () => void;
}

export interface Chrome {
  readonly element: HTMLElement;
  setRenderer(mode: RenderMode, note?: string): void;
  setCardCount(count: number): void;
  setZoom(zoom: number): void;
  setSaveState(label: string, state: 'saved' | 'session' | 'error'): void;
  showToast(message: string, durationMs?: number): void;
  openHelp(): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function button(className: string, label: string, text?: string): HTMLButtonElement {
  const control = el('button', className, text);
  control.type = 'button';
  control.setAttribute('aria-label', label);
  control.title = label;
  return control;
}

function shortcutRow(keys: string, description: string): HTMLLIElement {
  const row = el('li', 'help__shortcut');
  const key = el('kbd', 'help__key', keys);
  const copy = el('span', 'help__desc', description);
  row.append(key, copy);
  return row;
}

export function createChrome(handlers: ChromeHandlers): Chrome {
  const root = el('div', 'chrome');
  root.dataset.ui = '';

  const brand = el('header', 'brand');
  const brandMark = el('span', 'brand__mark');
  brandMark.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 4; index += 1) {
    brandMark.append(el('span', 'brand__dot'));
  }

  const brandCopy = el('div', 'brand__copy');
  const kicker = el('p', 'brand__kicker', 'LOCAL-FIRST CANVAS');
  const title = el('h1', 'brand__title', 'Infinite Workspace');
  brandCopy.append(kicker, title);

  const addButton = button('add-note', 'Add note at the centre of the view', '+ Add note');
  const addKey = el('kbd', 'add-note__key', 'N');
  addButton.append(addKey);
  addButton.addEventListener('click', handlers.onAddNote);

  brand.append(brandMark, brandCopy, addButton);

  const history = el('div', 'history');
  const undo = button('icon-button', 'Undo (available after the editing slice)', '↶');
  undo.disabled = true;
  const redo = button('icon-button', 'Redo (available after the editing slice)', '↷');
  redo.disabled = true;
  const helpButton = button('icon-button help-button', 'Help and shortcuts', '?');
  history.append(undo, redo, helpButton);

  const status = el('div', 'status');
  status.setAttribute('aria-label', 'Board status');
  const rendererItem = el('span', 'status__item');
  const rendererBadge = el('span', 'status__badge', 'DOM');
  rendererBadge.dataset.testid = 'renderer-badge';
  rendererBadge.dataset.mode = 'dom';
  rendererItem.append(rendererBadge);

  const countItem = el('span', 'status__item status__count', '216 cards');
  countItem.dataset.testid = 'card-count';

  const saveItem = el('span', 'status__item status__save');
  saveItem.dataset.state = 'session';
  const saveDot = el('span', 'status__dot');
  saveDot.setAttribute('aria-hidden', 'true');
  const saveText = el('span', 'status__save-text', 'Session only');
  saveItem.append(saveDot, saveText);

  status.append(
    rendererItem,
    el('span', 'status__divider'),
    countItem,
    el('span', 'status__divider'),
    saveItem,
  );

  const zoom = el('div', 'zoom');
  zoom.setAttribute('aria-label', 'Zoom controls');
  const zoomOut = button('zoom__button', 'Zoom out', '−');
  const zoomLevel = button('zoom__level', 'Zoom 100 percent. Reset to 100 percent.', '100%');
  zoomLevel.dataset.testid = 'zoom-level';
  const zoomIn = button('zoom__button', 'Zoom in', '+');
  const fit = button('zoom__fit', 'Fit the whole board in the view', 'Fit');
  zoomOut.addEventListener('click', handlers.onZoomOut);
  zoomIn.addEventListener('click', handlers.onZoomIn);
  zoomLevel.addEventListener('click', handlers.onResetZoom);
  fit.addEventListener('click', handlers.onFit);
  zoom.append(zoomOut, zoomLevel, zoomIn, el('span', 'zoom__divider'), fit);

  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;

  const dialog = el('dialog', 'help');
  const helpHeadingId = 'help-heading';
  dialog.setAttribute('aria-labelledby', helpHeadingId);
  const helpInner = el('div', 'help__inner');
  const helpHead = el('header', 'help__head');
  const helpTitle = el('h2', 'help__title', 'A wall of live HTML');
  helpTitle.id = helpHeadingId;
  const close = button('icon-button help__close', 'Close help', '×');
  helpHead.append(helpTitle, close);

  const helpIntro = el(
    'p',
    'help__intro',
    'In Chrome 157 and later, the cards are real children of a canvas and painted with the experimental HTML-in-Canvas API. Everywhere else the same cards live in a transformed DOM layer. Either way, the text is real.',
  );

  const moveHeading = el('h3', 'help__subhead', 'Move around');
  const moves = el('ul', 'help__shortcuts');
  moves.append(
    shortcutRow('Drag', 'Pan the board from empty paper'),
    shortcutRow('Scroll', 'Pan with a wheel or trackpad'),
    shortcutRow('Ctrl/Cmd + scroll', 'Zoom toward the pointer'),
    shortcutRow('+ / −', 'Zoom in and out'),
    shortcutRow('0', 'Fit the whole board'),
    shortcutRow('1', 'Return to 100 percent'),
    shortcutRow('N', 'Add a note at the centre'),
  );

  const findHeading = el('h3', 'help__subhead', 'Native find is the point');
  const findCopy = el(
    'p',
    'help__copy',
    'Press Ctrl/Cmd+F and search for needle. The browser highlights real text inside a real card — no custom search field, no painted fake. The seeded board deliberately hides the word in a few places.',
  );

  const supportHeading = el('h3', 'help__subhead', 'Browser support');
  const supportCopy = el(
    'p',
    'help__copy',
    'Chrome 157+ uses the canvas renderer. Modern browsers without the experimental API get the complete DOM renderer. Add ?render=dom or ?render=canvas to the URL to compare.',
  );

  const closeRow = el('div', 'help__actions');
  const closeButton = button('help__done', 'Close help', 'Back to the wall');
  closeRow.append(closeButton);

  helpInner.append(
    helpHead,
    helpIntro,
    moveHeading,
    moves,
    findHeading,
    findCopy,
    supportHeading,
    supportCopy,
    closeRow,
  );
  dialog.append(helpInner);

  root.append(brand, history, status, zoom, toast, dialog);

  let toastTimer: number | undefined;
  let lastFocused: HTMLElement | null = null;

  const closeHelp = (): void => {
    if (dialog.open) {
      dialog.close();
    }
  };

  const openHelp = (): void => {
    const active = document.activeElement;
    lastFocused = active instanceof HTMLElement && active !== document.body ? active : helpButton;
    if (!dialog.open) {
      dialog.showModal();
    }
    closeButton.focus();
  };

  helpButton.addEventListener('click', openHelp);
  close.addEventListener('click', closeHelp);
  closeButton.addEventListener('click', closeHelp);
  dialog.addEventListener('close', () => {
    lastFocused?.focus();
    lastFocused = null;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      closeHelp();
    }
  });

  return {
    element: root,
    setRenderer(mode: RenderMode, note?: string): void {
      rendererBadge.textContent = mode === 'canvas' ? 'Canvas' : 'DOM';
      rendererBadge.dataset.mode = mode;
      rendererBadge.title =
        note ??
        (mode === 'canvas'
          ? 'Cards are painted by the HTML-in-Canvas renderer'
          : 'Cards are positioned in the DOM renderer');
    },
    setCardCount(count: number): void {
      countItem.textContent = `${count} ${count === 1 ? 'card' : 'cards'}`;
    },
    setZoom(zoom: number): void {
      const percent = Math.round(zoom * 100);
      zoomLevel.textContent = `${percent}%`;
      zoomLevel.setAttribute('aria-label', `Zoom ${percent} percent. Reset to 100 percent.`);
    },
    setSaveState(label: string, state: 'saved' | 'session' | 'error'): void {
      saveText.textContent = label;
      saveItem.dataset.state = state;
    },
    showToast(message: string, durationMs = 4500): void {
      if (toastTimer !== undefined) {
        window.clearTimeout(toastTimer);
      }
      toast.textContent = message;
      toast.hidden = false;
      toast.classList.add('is-visible');
      toastTimer = window.setTimeout(() => {
        toast.classList.remove('is-visible');
        toast.hidden = true;
        toastTimer = undefined;
      }, durationMs);
    },
    openHelp,
    destroy(): void {
      if (toastTimer !== undefined) {
        window.clearTimeout(toastTimer);
      }
      dialog.close();
      root.remove();
    },
  };
}
