import { EMPTY, ERROR, LOADING } from '../block.js';
import { element } from '../dom.js';
import { formatDate } from '../format.js';
import { buildVerbatimRows, searchVerbatimRows } from '../verbatim.js';

const COLUMN_LABELS = ['Дата', 'Канал', 'Сегмент', 'Триггер', 'Категория', 'Оценка', 'Комментарий'];
const PAGE_SIZE = 20;
let tableQuery = '';

function tableHead() {
  const head = element('thead');
  const row = element('tr');
  for (const label of COLUMN_LABELS) row.append(element('th', null, label));
  head.append(row);
  return head;
}

function tableRow(item) {
  const row = element('tr');
  const values = [
    formatDate(item.date),
    item.channel,
    item.segment,
    item.trigger,
    item.category,
    String(item.rating),
    item.comment,
  ];
  values.forEach((value, index) => {
    const cell = element('td', index === values.length - 1 ? 'verbatim-table__comment' : null, value);
    if (index === values.length - 1) cell.title = value;
    row.append(cell);
  });
  return row;
}

function searchControl() {
  const search = element('label', 'verbatim-search');
  search.append(element('span', 'visually-hidden', 'Поиск по прямой речи'));
  const input = element('input', 'verbatim-search__input');
  input.type = 'search';
  input.placeholder = 'Поиск…';
  input.value = tableQuery;
  input.setAttribute('aria-label', 'Поиск по прямой речи');
  search.append(input);
  return { search, input };
}

export function renderVerbatimTable(block, context) {
  const { search, input } = searchControl();
  block.setNote(search);
  if (context.slice.length === 0) {
    block.setState(EMPTY);
    return;
  }
  if (context.verbatim.status === 'idle') context.requestVerbatim();
  if (context.verbatim.status === 'idle' || context.verbatim.status === 'loading') {
    block.setState(LOADING);
    return;
  }
  if (context.verbatim.status === 'error') {
    block.setState(ERROR, context.verbatim.error);
    return;
  }

  const allRows = buildVerbatimRows(context.slice, context.verbatim.data);
  if (!allRows.length) {
    block.setContent(element('p', 'state__title', 'В выбранном срезе нет клиентских комментариев'));
    return;
  }

  const wrap = element('div', 'verbatim-detail');
  const status = element('p', 'verbatim-detail__status');
  const scroll = element('div', 'verbatim-table-scroll');
  const table = element('table', 'verbatim-table');
  const body = element('tbody');
  table.append(tableHead(), body);
  scroll.append(table);
  const more = element('button', 'verbatim-detail__more', 'Показать ещё');
  more.type = 'button';
  let shown = PAGE_SIZE;

  function paint() {
    const found = searchVerbatimRows(allRows, tableQuery);
    body.replaceChildren(...found.slice(0, shown).map(tableRow));
    status.textContent = `Показано ${Math.min(shown, found.length)} из ${found.length}`;
    more.hidden = shown >= found.length;
    if (!found.length) {
      const row = element('tr');
      const cell = element('td', 'verbatim-table__empty', 'Поиск не дал результатов');
      cell.colSpan = COLUMN_LABELS.length;
      row.append(cell);
      body.append(row);
    }
  }

  input.addEventListener('input', () => {
    tableQuery = input.value;
    shown = PAGE_SIZE;
    paint();
  });
  more.addEventListener('click', () => {
    shown += PAGE_SIZE;
    paint();
  });
  wrap.append(status, scroll, more);
  paint();
  block.setContent(wrap);
}
