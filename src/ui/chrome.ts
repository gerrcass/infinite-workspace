import type { ViewportSize } from '../camera/camera';
import type { RenderMode } from '../render/mode';
import type { SaveStatus } from '../store/persistence';
import type { HistoryState } from '../store/store';
import { CARD_COLORS, type CardColor } from '../store/types';

export type SaveState = SaveStatus;

export interface ToolbarRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface SelectionToolbarState {
  readonly color: CardColor;
  readonly rect: ToolbarRect;
  readonly viewport: ViewportSize;
}

export interface ChromeHandlers {
  readonly onAddNote: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onResetZoom: () => void;
  readonly onFit: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onColor: (color: CardColor) => void;
  readonly onResetDemo: () => void;
  readonly onClearSavedData: () => void;
}

export interface Chrome {
  readonly element: HTMLElement;
  setRenderer(mode: RenderMode, note?: string): void;
  setCardCount(count: number): void;
  setZoom(zoom: number): void;
  setSaveState(label: string, state: SaveState): void;
  setHistoryState(state: HistoryState): void;
  updateSelectionToolbar(selection: SelectionToolbarState | null): void;
  showToast(message: string, durationMs?: number): void;
  showHint(onDismiss: () => void): void;
  openHelp(): void;
  destroy(): void;
}

const COLOR_LABELS: Record<CardColor, string> = {
  cream: 'Cream',
  butter: 'Butter',
  rose: 'Rose',
  mint: 'Mint',
  sky: 'Sky',
  lilac: 'Lilac',
  peach: 'Peach',
};

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createChrome(handlers: ChromeHandlers): Chrome {
  const root = el('div', 'chrome');
  root.dataset.ui = '';

  const brand = el('header', 'brand');
  brand.setAttribute('aria-label', 'Infinite Workspace');
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
  const undo = button('icon-button', 'Undo (Ctrl/Cmd+Z)', '↶');
  undo.disabled = true;
  undo.addEventListener('click', handlers.onUndo);
  const redo = button('icon-button', 'Redo (Shift+Ctrl/Cmd+Z)', '↷');
  redo.disabled = true;
  redo.addEventListener('click', handlers.onRedo);
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
  saveItem.setAttribute('aria-live', 'polite');
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

  const hint = el('aside', 'find-hint');
  hint.dataset.testid = 'find-hint';
  hint.hidden = true;
  hint.setAttribute('role', 'note');
  hint.setAttribute('aria-label', 'Native find tip');
  const hintCopy = el('p', 'find-hint__copy', 'Every card is real text. Press ');
  hintCopy.append(
    el('kbd', 'find-hint__key', 'Ctrl/Cmd+F'),
    document.createTextNode(' and search for '),
    el('mark', 'find-hint__needle', 'needle'),
    document.createTextNode('.'),
  );
  const hintDismiss = button('find-hint__dismiss', 'Dismiss find tip', 'Got it');
  hint.append(hintCopy, hintDismiss);

  const selectionToolbar = el('div', 'selection-toolbar');
  selectionToolbar.hidden = true;
  selectionToolbar.setAttribute('role', 'toolbar');
  selectionToolbar.setAttribute('aria-label', 'Selected card actions');
  const colorGroup = el('div', 'selection-toolbar__colors');
  colorGroup.setAttribute('role', 'group');
  colorGroup.setAttribute('aria-label', 'Card color');
  const swatches = new Map<CardColor, HTMLButtonElement>();
  for (const color of CARD_COLORS) {
    const swatch = button('selection-toolbar__swatch', `${COLOR_LABELS[color]} card color`);
    swatch.dataset.color = color;
    swatch.setAttribute('aria-pressed', 'false');
    swatch.addEventListener('click', () => handlers.onColor(color));
    swatches.set(color, swatch);
    colorGroup.append(swatch);
  }
  const duplicate = button('selection-toolbar__action', 'Duplicate selected card', 'Duplicate');
  duplicate.addEventListener('click', handlers.onDuplicate);
  const remove = button(
    'selection-toolbar__action selection-toolbar__action--danger',
    'Delete selected card',
    'Delete',
  );
  remove.addEventListener('click', handlers.onDelete);
  selectionToolbar.append(colorGroup, el('span', 'selection-toolbar__divider'), duplicate, remove);

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
    'In Chrome 157 and later, the cards are real children of a canvas and painted with the experimental HTML-in-Canvas API. Everywhere else the same cards live in a transformed DOM layer. Either way, the text is real, editable, and saved on this device.',
  );

  const moveHeading = el('h3', 'help__subhead', 'Move around');
  const moves = el('ul', 'help__shortcuts');
  moves.append(
    shortcutRow('Drag', 'Pan the board from empty paper'),
    shortcutRow('Space + drag', 'Pan even when the pointer starts on a card'),
    shortcutRow('Middle-drag', 'Pan from anywhere on the board'),
    shortcutRow('Scroll', 'Pan with a wheel or trackpad'),
    shortcutRow('Ctrl/Cmd + scroll', 'Zoom toward the pointer'),
    shortcutRow('Arrow keys', 'Pan 80 px; hold Shift for 240 px'),
    shortcutRow('+ / −', 'Zoom in and out'),
    shortcutRow('0', 'Fit the whole board'),
    shortcutRow('1', 'Return to 100 percent'),
  );

  const cardHeading = el('h3', 'help__subhead', 'Edit and arrange cards');
  const cardMoves = el('ul', 'help__shortcuts');
  cardMoves.append(
    shortcutRow('Click text', 'Put a real caret in the title, body, or checklist'),
    shortcutRow('Click chrome', 'Select a card and open its toolbar'),
    shortcutRow('Drag top strip', 'Move a card; it comes to the front'),
    shortcutRow('N', 'Add a note at the centre'),
    shortcutRow('Ctrl/Cmd + D', 'Duplicate the selected card'),
    shortcutRow('Delete / Backspace', 'Delete the selected card when not typing'),
    shortcutRow('Esc', 'Leave a text field, then clear the selection'),
    shortcutRow('Toolbar', 'Change colour, duplicate, or delete'),
  );

  const historyHeading = el('h3', 'help__subhead', 'Undo and redo');
  const historyMoves = el('ul', 'help__shortcuts');
  historyMoves.append(
    shortcutRow('Ctrl/Cmd + Z', 'Undo a board change or a whole text session'),
    shortcutRow('Shift + Ctrl/Cmd + Z', 'Redo'),
    shortcutRow('While typing', 'Native text undo stays native'),
  );

  const findHeading = el('h3', 'help__subhead', 'Native find is the point');
  const findCopy = el(
    'p',
    'help__copy',
    'Press Ctrl/Cmd+F and search for needle. The browser highlights real text inside a real card — no custom search field, no painted fake. The seeded board deliberately hides the word in a few places. Chrome’s find bar does not expose its active match to the page, so it cannot move the camera; pan to an off-screen match. A selection-based find, such as window.find(), can trigger the camera reveal.',
  );

  const dataHeading = el('h3', 'help__subhead', 'Board data');
  const dataCopy = el(
    'p',
    'help__copy',
    'The board and camera save automatically in this browser. Undo history stays in this session. Resetting restores the curated 216-card demo; clearing removes the saved record.',
  );
  const dataActions = el('div', 'help__data-actions');
  const resetDemo = button('help__secondary', 'Reset demo', 'Reset demo');
  const clearData = button('help__secondary', 'Clear saved data', 'Clear saved data');
  dataActions.append(resetDemo, clearData);

  const confirmPanel = el('div', 'help__confirm');
  confirmPanel.hidden = true;
  confirmPanel.setAttribute('role', 'group');
  confirmPanel.setAttribute('aria-label', 'Confirm board data action');
  const confirmCopy = el('p', 'help__confirm-copy');
  confirmCopy.id = 'help-confirm-copy';
  const confirmActions = el('div', 'help__confirm-actions');
  const cancelConfirm = button('help__secondary', 'Cancel', 'Cancel');
  const confirmAction = button('help__danger', 'Confirm action', 'Confirm');
  confirmAction.setAttribute('aria-describedby', confirmCopy.id);
  confirmActions.append(cancelConfirm, confirmAction);
  confirmPanel.append(confirmCopy, confirmActions);
  const dataSection = el('div', 'help__data');
  dataSection.append(dataCopy, dataActions, confirmPanel);

  const supportHeading = el('h3', 'help__subhead', 'Browser support');
  const supportCopy = el(
    'p',
    'help__copy',
    'Chrome 157+ uses the canvas renderer. Chrome 156 can use it with chrome://flags/#canvas-draw-element; the app sets both content="drawable" and the older layoutsubtree spelling. Modern browsers without the experimental API get the complete DOM renderer. Add ?render=dom or ?render=canvas to the URL to compare.',
  );

  const closeRow = el('div', 'help__actions');
  const closeButton = button('help__done', 'Close help', 'Back to the wall');
  closeRow.append(closeButton);

  helpInner.append(
    helpHead,
    helpIntro,
    moveHeading,
    moves,
    cardHeading,
    cardMoves,
    historyHeading,
    historyMoves,
    findHeading,
    findCopy,
    dataHeading,
    dataSection,
    supportHeading,
    supportCopy,
    closeRow,
  );
  dialog.append(helpInner);

  root.append(brand, history, status, zoom, toast, hint, dialog, selectionToolbar);

  let toastTimer: number | undefined;
  let lastFocused: HTMLElement | null = null;
  let pendingDataAction: 'reset' | 'clear' | null = null;
  let hintDismissCallback: (() => void) | null = null;

  const resetConfirm = (): void => {
    pendingDataAction = null;
    confirmPanel.hidden = true;
    dataActions.hidden = false;
  };

  const closeHelp = (): void => {
    resetConfirm();
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

  const showConfirm = (action: 'reset' | 'clear'): void => {
    pendingDataAction = action;
    confirmCopy.textContent =
      action === 'reset'
        ? 'Reset the demo? This replaces the current board with the curated 216-card wall and the opening camera. Your saved edits on this device will be removed.'
        : 'Clear the saved board from this browser? The demo board returns for this session, and future edits will save again.';
    confirmAction.textContent = action === 'reset' ? 'Reset demo' : 'Clear saved data';
    confirmAction.setAttribute(
      'aria-label',
      action === 'reset' ? 'Confirm reset demo' : 'Confirm clear saved data',
    );
    dataActions.hidden = true;
    confirmPanel.hidden = false;
    confirmAction.focus();
  };

  resetDemo.addEventListener('click', () => showConfirm('reset'));
  clearData.addEventListener('click', () => showConfirm('clear'));
  cancelConfirm.addEventListener('click', () => {
    const origin = pendingDataAction === 'clear' ? clearData : resetDemo;
    resetConfirm();
    origin.focus();
  });
  confirmAction.addEventListener('click', () => {
    const action = pendingDataAction;
    resetConfirm();
    if (action === 'reset') {
      handlers.onResetDemo();
    } else if (action === 'clear') {
      handlers.onClearSavedData();
    }
    closeHelp();
  });

  helpButton.addEventListener('click', openHelp);
  close.addEventListener('click', closeHelp);
  closeButton.addEventListener('click', closeHelp);
  hintDismiss.addEventListener('click', () => {
    hint.hidden = true;
    const dismiss = hintDismissCallback;
    hintDismissCallback = null;
    dismiss?.();
  });
  dialog.addEventListener('close', () => {
    resetConfirm();
    const target = lastFocused?.isConnected ? lastFocused : helpButton;
    target.focus();
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
    setSaveState(label: string, state: SaveState): void {
      saveText.textContent = label;
      saveItem.dataset.state = state;
    },
    setHistoryState(state: HistoryState): void {
      undo.disabled = !state.canUndo;
      redo.disabled = !state.canRedo;
    },
    updateSelectionToolbar(selection: SelectionToolbarState | null): void {
      if (!selection) {
        selectionToolbar.hidden = true;
        return;
      }

      for (const [color, swatch] of swatches) {
        swatch.setAttribute('aria-pressed', color === selection.color ? 'true' : 'false');
      }

      selectionToolbar.hidden = false;
      const width = selectionToolbar.offsetWidth;
      const height = selectionToolbar.offsetHeight;
      const margin = 8;
      const gap = 10;
      // Keep clear of the floating brand/history row; flip below the card
      // rather than covering chrome the user still needs.
      const topSafe = 96;
      const maxLeft = Math.max(margin, selection.viewport.width - width - margin);
      const left = clamp(
        selection.rect.left + (selection.rect.right - selection.rect.left) / 2 - width / 2,
        margin,
        maxLeft,
      );
      let top = selection.rect.top - height - gap;
      if (top < topSafe) {
        top = selection.rect.bottom + gap;
      }
      const maxTop = Math.max(margin, selection.viewport.height - height - margin);
      selectionToolbar.style.left = `${Math.round(left)}px`;
      selectionToolbar.style.top = `${Math.round(clamp(top, margin, maxTop))}px`;
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
    showHint(onDismiss: () => void): void {
      hintDismissCallback = onDismiss;
      hint.hidden = false;
      hint.classList.add('is-visible');
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
