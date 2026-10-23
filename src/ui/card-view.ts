import { CARD_WIDTHS, type Card, type ChecklistItem } from '../store/types';

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
 * Builds the one and only DOM for a card. Renderers reuse this view for the
 * card's lifetime; camera changes never recreate it.
 */
export function createCardView(card: Card): CardView {
  const element = makeElement('article', 'card');
  element.dataset.cardId = card.id;
  element.tabIndex = 0;

  const meta = makeElement('header', 'card__meta');
  meta.dataset.dragStrip = '';
  const tag = makeElement('span', 'card__tag');
  const mark = makeElement('span', 'card__mark');
  mark.setAttribute('aria-hidden', 'true');
  meta.append(tag, mark);

  const titleId = `${card.id}-title`;
  const title = makeElement('h2', 'card__title');
  title.id = titleId;
  element.setAttribute('aria-labelledby', titleId);

  const body = makeElement('p', 'card__body');
  const checklist = makeElement('ul', 'card__checklist');
  const checklistViews = new Map<string, ChecklistView>();

  element.append(meta, title, body, checklist);

  const syncChecklistItem = (view: ChecklistView, item: ChecklistItem): void => {
    view.input.dataset.checkId = item.id;
    if (document.activeElement !== view.input) {
      view.input.checked = item.done;
    }
    if (view.text.textContent !== item.text && document.activeElement !== view.text) {
      view.text.textContent = item.text;
    }
    view.input.setAttribute('aria-label', item.text);
    view.input.closest('li')?.classList.toggle('is-done', item.done);
  };

  const syncChecklist = (items: readonly ChecklistItem[], cardTitle: string): void => {
    checklist.hidden = items.length === 0;
    checklist.setAttribute('aria-label', items.length > 0 ? `Checklist for ${cardTitle}` : '');
    const seen = new Set<string>();

    items.forEach((item, index) => {
      seen.add(item.id);
      let view = checklistViews.get(item.id);
      if (!view) {
        const li = makeElement('li', 'card__check');
        const label = makeElement('label', 'card__check-label');
        const input = makeElement('input');
        input.type = 'checkbox';
        const text = makeElement('span', 'card__check-text');
        label.append(input, text);
        li.append(label);
        view = { item: li, input, text };
        checklistViews.set(item.id, view);
        if (index >= checklist.children.length) {
          checklist.append(li);
        } else {
          checklist.insertBefore(li, checklist.children[index] ?? null);
        }
      }
      syncChecklistItem(view, item);
    });

    for (const [id, view] of checklistViews) {
      if (!seen.has(id)) {
        view.item.remove();
        checklistViews.delete(id);
      }
    }
  };

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
      body.hidden = next.body.length === 0;
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
