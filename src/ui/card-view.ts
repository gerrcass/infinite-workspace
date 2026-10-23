import { CARD_WIDTHS, type Card, type ChecklistItem } from '../store/types';

export interface CardViewHandlers {
  updateCardText(cardId: string, field: 'title' | 'body', text: string): void;
  updateChecklistText(cardId: string, itemId: string, text: string): void;
  toggleChecklistItem(cardId: string, itemId: string, done: boolean): void;
  addChecklistItem(cardId: string): string | null;
  removeChecklistItem(cardId: string, itemId: string): void;
}

export interface CardView {
  readonly element: HTMLElement;
  readonly cardId: string;
  update(card: Card): void;
  setSelected(selected: boolean): void;
  destroy(): void;
}

interface ChecklistView {
  readonly item: HTMLLIElement;
  readonly input: HTMLInputElement;
  readonly text: HTMLSpanElement;
  readonly remove: HTMLButtonElement;
}

function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

/**
 * Prefer plaintext-only contenteditable so browsers never create markup. Older
 * engines fall back to the boolean form; paste normalization still applies.
 */
function makePlainTextEditable(element: HTMLElement): void {
  try {
    element.contentEditable = 'plaintext-only';
  } catch {
    // Older engines reject the token; the boolean form still edits text.
  }
  if (element.contentEditable !== 'plaintext-only') {
    element.contentEditable = 'true';
  }
  element.spellcheck = true;
}

function singleLineText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}

function plainText(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/** Read rendered text so browser-inserted line breaks survive as newlines. */
function editableText(element: HTMLElement): string {
  return plainText(element.innerText || element.textContent || '');
}

/**
 * Insert a paste as plain text through the editing pipeline so the browser's
 * native undo stack still records it as one edit.
 */
function insertPlainText(text: string): void {
  if (text.length === 0) {
    return;
  }

  if (
    typeof document.execCommand === 'function' &&
    document.execCommand('insertText', false, text)
  ) {
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);

  const editable = node.parentElement?.closest<HTMLElement>('[contenteditable]');
  editable?.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
  );
}

function syncEmptyState(element: HTMLElement, placeholder: string): void {
  const empty = element.innerText.length === 0 && element.textContent?.length === 0;
  element.dataset.empty = empty ? 'true' : 'false';
  element.dataset.placeholder = placeholder;
}

function attachPlainTextPaste(element: HTMLElement, normalize: (value: string) => string): void {
  element.addEventListener('paste', (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) {
      return;
    }
    event.preventDefault();
    insertPlainText(normalize(clipboard.getData('text/plain')));
  });
}

/**
 * Builds the one and only DOM for a card. Renderers reuse this view for the
 * card's lifetime; camera changes never recreate it.
 */
export function createCardView(card: Card, handlers: CardViewHandlers): CardView {
  const element = makeElement('article', 'card');
  element.dataset.cardId = card.id;
  element.tabIndex = 0;

  const meta = makeElement('header', 'card__meta');
  meta.dataset.dragStrip = '';
  const tag = makeElement('span', 'card__tag');
  const metaActions = makeElement('div', 'card__meta-actions');
  const mark = makeElement('span', 'card__mark');
  mark.setAttribute('aria-hidden', 'true');
  const addCheck = makeElement('button', 'card__add-check');
  addCheck.type = 'button';
  addCheck.textContent = '+';
  addCheck.setAttribute('aria-label', 'Add checklist item');
  addCheck.title = 'Add checklist item';
  metaActions.append(mark, addCheck);
  meta.append(tag, metaActions);

  const titleId = `${card.id}-title`;
  const title = makeElement('h2', 'card__title');
  title.id = titleId;
  title.dataset.field = 'title';
  title.setAttribute('aria-label', 'Card title');
  title.setAttribute('aria-multiline', 'false');
  makePlainTextEditable(title);
  element.setAttribute('aria-labelledby', titleId);

  const body = makeElement('p', 'card__body');
  body.dataset.field = 'body';
  body.setAttribute('aria-label', 'Card body');
  body.setAttribute('aria-multiline', 'true');
  makePlainTextEditable(body);

  const checklist = makeElement('ul', 'card__checklist');
  const checklistViews = new Map<string, ChecklistView>();

  element.append(meta, title, body, checklist);

  const syncEmptyStates = (next: Pick<Card, 'title' | 'body'>): void => {
    syncEmptyState(title, 'Add a title');
    syncEmptyState(body, 'Write something');
    title.dataset.empty = (next.title.length === 0).toString();
    body.dataset.empty = (next.body.length === 0).toString();
    title.dataset.placeholder = 'Add a title';
    body.dataset.placeholder = 'Write something';
  };

  const syncChecklistItem = (view: ChecklistView, item: ChecklistItem, index: number): void => {
    view.input.dataset.checkId = item.id;
    // A checkbox always mirrors the model, even while focused; this keeps
    // undo/redo honest without touching native text selection or carets.
    view.input.checked = item.done;
    const label = item.text.trim().length > 0 ? item.text : `checklist item ${index + 1}`;
    view.input.setAttribute('aria-label', `Toggle ${label}`);
    view.input.id = `${card.id}-toggle-${item.id}`;
    if (view.text.textContent !== item.text && document.activeElement !== view.text) {
      view.text.textContent = item.text;
    }
    view.text.dataset.checkId = item.id;
    view.text.setAttribute('aria-label', `Checklist label: ${label}`);
    view.text.dataset.placeholder = 'Checklist item';
    view.text.dataset.empty = item.text.length === 0 ? 'true' : 'false';
    view.remove.setAttribute('aria-label', `Remove checklist item: ${label}`);
    view.remove.dataset.checkId = item.id;
    view.item.classList.toggle('is-done', item.done);
  };

  const onChecklistInput = (text: HTMLSpanElement, itemId: string): void => {
    const value = singleLineText(text.innerText);
    if (text.innerText !== value) {
      text.textContent = value;
    }
    syncEmptyState(text, 'Checklist item');
    handlers.updateChecklistText(card.id, itemId, value);
  };

  const bindChecklistItem = (itemView: ChecklistView, itemId: string): void => {
    itemView.input.addEventListener('change', () => {
      handlers.toggleChecklistItem(card.id, itemId, itemView.input.checked);
    });
    itemView.text.addEventListener('input', () => onChecklistInput(itemView.text, itemId));
    itemView.text.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        itemView.text.blur();
      }
    });
    attachPlainTextPaste(itemView.text, singleLineText);
    itemView.remove.addEventListener('click', () => {
      handlers.removeChecklistItem(card.id, itemId);
    });
  };

  const syncChecklist = (items: readonly ChecklistItem[], cardTitle: string): void => {
    checklist.hidden = items.length === 0;
    checklist.setAttribute('aria-label', items.length > 0 ? `Checklist for ${cardTitle}` : '');
    addCheck.dataset.empty = items.length === 0 ? 'true' : 'false';
    const seen = new Set<string>();

    items.forEach((item, index) => {
      seen.add(item.id);
      let itemView = checklistViews.get(item.id);
      let created = false;
      if (!itemView) {
        created = true;
        const li = makeElement('li', 'card__check');
        const input = makeElement('input');
        input.type = 'checkbox';
        const text = makeElement('span', 'card__check-text');
        makePlainTextEditable(text);
        const remove = makeElement('button', 'card__check-remove');
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = 'Remove checklist item';
        li.append(input, text, remove);
        itemView = { item: li, input, text, remove };
        checklistViews.set(item.id, itemView);
        if (index >= checklist.children.length) {
          checklist.append(li);
        } else {
          checklist.insertBefore(li, checklist.children[index] ?? null);
        }
      }
      syncChecklistItem(itemView, item, index);
      if (created) {
        bindChecklistItem(itemView, item.id);
      }
    });

    for (const [id, itemView] of checklistViews) {
      if (!seen.has(id)) {
        itemView.item.remove();
        checklistViews.delete(id);
      }
    }
  };

  const commitText = (field: 'title' | 'body'): void => {
    const raw = field === 'title' ? title.innerText : editableText(body);
    const value = field === 'title' ? singleLineText(raw) : raw;
    if (field === 'title' && raw !== value) {
      title.textContent = value;
    }
    syncEmptyState(title, 'Add a title');
    syncEmptyState(body, 'Write something');
    handlers.updateCardText(card.id, field, value);
  };

  title.addEventListener('input', () => {
    syncEmptyState(title, 'Add a title');
    handlers.updateCardText(card.id, 'title', singleLineText(title.innerText));
  });
  body.addEventListener('input', () => {
    syncEmptyState(body, 'Write something');
    handlers.updateCardText(card.id, 'body', editableText(body));
  });
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      title.blur();
    }
  });
  title.addEventListener('blur', () => {
    commitText('title');
  });
  body.addEventListener('blur', () => {
    commitText('body');
  });
  attachPlainTextPaste(title, singleLineText);
  attachPlainTextPaste(body, plainText);

  addCheck.addEventListener('click', () => {
    const itemId = handlers.addChecklistItem(card.id);
    if (!itemId) {
      return;
    }
    const view = checklistViews.get(itemId);
    view?.text.focus();
  });

  const view: CardView = {
    element,
    cardId: card.id,
    update(next: Card): void {
      const colorClass = `card--${next.color}`;
      for (const className of [...element.classList]) {
        if (className.startsWith('card--')) {
          element.classList.remove(className);
        }
      }
      element.classList.add(colorClass);
      element.style.setProperty('--card-width', `${CARD_WIDTHS[next.width]}px`);
      element.style.setProperty('--card-x', `${next.x}px`);
      element.style.setProperty('--card-y', `${next.y}px`);
      element.style.zIndex = String(next.z);
      element.dataset.tag = next.tag;
      element.dataset.color = next.color;

      if (tag.textContent !== next.tag) {
        tag.textContent = next.tag;
      }
      if (title.textContent !== next.title && document.activeElement !== title) {
        title.textContent = next.title;
      }
      if (body.textContent !== next.body && document.activeElement !== body) {
        body.textContent = next.body;
      }
      syncEmptyStates(next);
      syncChecklist(next.checklist, next.title);
    },
    setSelected(selected: boolean): void {
      element.classList.toggle('is-selected', selected);
      element.dataset.selected = selected ? 'true' : 'false';
    },
    destroy(): void {
      element.remove();
      checklistViews.clear();
    },
  };

  view.update(card);
  view.setSelected(false);
  return view;
}
