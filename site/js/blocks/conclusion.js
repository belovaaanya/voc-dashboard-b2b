import { EMPTY } from '../block.js';
import { buildConclusion } from '../conclusions.js';
import { DIMENSIONS } from '../dimensions.js';
import { element } from '../dom.js';
import { formatImpact } from '../format.js';
import { roundImpact } from '../round.js';

const TRIGGER = DIMENSIONS.find(({ key }) => key === 'trigger');

function factorNames(items, context) {
  return items.map(({ key }) => context.label('trigger', key));
}

function detail(items, context) {
  return items
    .map((item) => `${context.label('trigger', item.key)} ${formatImpact(roundImpact(item.impact))}`)
    .join('; ');
}

function summaryRow(tone, items, context) {
  const names = factorNames(items, context).join(', ');
  const prefix = tone === 'positive' ? 'Рост поддерживают: ' : 'VOC снижают: ';
  const caption = `${prefix}${names}`;
  const row = element('div', `summary-row summary-row--${tone}`);
  row.setAttribute('tabindex', '0');
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', `${caption}. Вклад: ${detail(items, context)}`);
  row.title = `${caption} · ${detail(items, context)}`;

  const icon = element('span', 'summary-row__icon', tone === 'positive' ? '↗' : '↘');
  icon.setAttribute('aria-hidden', 'true');
  const copy = element('span', 'summary-row__text');
  copy.append(element('span', 'summary-row__prefix', prefix), element('span', 'summary-row__factors', names));
  row.append(icon, copy);
  return row;
}

function comparisonUnavailable() {
  const state = element('div', 'summary-unavailable');
  state.setAttribute('role', 'status');
  state.append(
    element('p', 'state__title', 'Нет данных предыдущего периода'),
    element('p', 'state__detail', 'Выберите период, для которого доступно сравнение.'),
  );
  return state;
}

function flatConclusion() {
  const row = element('div', 'summary-row summary-row--neutral');
  row.append(element('span', 'summary-row__icon', '→'), element('span', 'summary-row__text', 'VOC без заметных факторов изменения'));
  return row;
}

export function renderConclusion(block, context) {
  block.setNote(element('span', 'summary-ai', '✦ Сделано с AI'));
  if (context.slice.length === 0) {
    block.setState(EMPTY);
    return;
  }
  if (context.previousSlice.length === 0) {
    block.setContent(comparisonUnavailable());
    return;
  }

  const project = (row) => TRIGGER.values(row, context.reference);
  const conclusion = buildConclusion(context.previousSlice, context.slice, project);
  const list = element('div', 'summary-list');
  if (conclusion.positive.length) list.append(summaryRow('positive', conclusion.positive, context));
  if (conclusion.negative.length) list.append(summaryRow('negative', conclusion.negative, context));
  if (!list.childElementCount) list.append(flatConclusion());
  block.setContent(list);
}
