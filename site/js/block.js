/*
  Карточка блока и её три служебных состояния: загрузка, нет данных за период,
  ошибка загрузки (D-34).

  Состояния различаются текстом, а не только цветом, поэтому читаются
  в grayscale (D-26).
*/

import { element } from './dom.js';

export const LOADING = 'loading';
export const EMPTY = 'empty';
export const ERROR = 'error';
export const READY = 'ready';

const TEXTS = {
  [LOADING]: { title: 'Загружаем данные…', detail: '' },
  [EMPTY]: {
    title: 'Нет данных за выбранный период',
    detail: 'Измените период или снимите часть фильтров.',
  },
  [ERROR]: {
    title: 'Данные не загрузились',
    detail: '',
  },
};

function renderState(state, detail) {
  const wrap = element('div', `state state--${state}`);
  wrap.setAttribute('role', 'status');

  if (state === LOADING) {
    wrap.append(element('div', 'state__skeleton'), element('div', 'state__skeleton'));
    wrap.append(element('span', 'visually-hidden', TEXTS[LOADING].title));
    return wrap;
  }

  const texts = TEXTS[state];
  wrap.append(element('p', 'state__title', texts.title));
  const detailText = detail || texts.detail;
  if (detailText) wrap.append(element('p', 'state__detail', detailText));
  return wrap;
}

export function createBlock({ title, note, modifier }) {
  const card = element('section', modifier ? `card ${modifier}` : 'card');

  const head = element('div', 'card__head');
  const heading = element('h2', 'card__title', title);
  head.append(heading);

  const noteNode = element('span', 'card__note');
  if (note) noteNode.textContent = note;
  head.append(noteNode);

  const body = element('div', 'card__body');
  card.append(head, body);

  return {
    element: card,
    setTitle(text) {
      heading.textContent = text;
    },
    /* Принимает и узел: бейдж плана стоит на строке заголовка (design-spec §3.1) */
    setNote(content) {
      if (content === null || content === undefined) noteNode.replaceChildren();
      else if (content instanceof Node) noteNode.replaceChildren(content);
      else noteNode.textContent = content;
    },
    setState(state, detail) {
      body.replaceChildren(
        state === READY ? element('p', 'placeholder', detail) : renderState(state, detail),
      );
    },
    setContent(node) {
      body.replaceChildren(node);
    },
  };
}
