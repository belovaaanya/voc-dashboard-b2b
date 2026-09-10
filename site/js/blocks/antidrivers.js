import { EMPTY } from '../block.js';
import { buildHeatmap, heatTone, rankAntidrivers } from '../antidrivers.js';
import { chartDomain, linePaths, plotPoints } from '../chart-geometry.js';
import { DIMENSIONS } from '../dimensions.js';
import { element } from '../dom.js';
import { formatCount, formatDate, formatDateRange, formatImpact, formatVoc } from '../format.js';
import { roundImpact } from '../round.js';
import { recommendedScale } from '../timeseries.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DIMENSION_KEYS = ['product', 'trigger', 'cp', 'domain'];

let selectedAntidriverDimension = 'product';
let selectedAntidriverView = 'ranking';
let focusedAntidriver = null;

function svgNode(tag, className, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute('class', className);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function tabGroup(label, options, selected, onSelect) {
  const group = element('span', 'antidriver-tabs');
  group.setAttribute('role', 'tablist');
  group.setAttribute('aria-label', label);
  for (const option of options) {
    const button = element('button', 'antidriver-tabs__tab', option.label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(option.value === selected));
    button.addEventListener('click', () => onSelect(option.value));
    group.append(button);
  }
  return group;
}

function controls(block, context, dimensions) {
  const wrap = element('span', 'antidriver-controls');
  wrap.append(element('span', 'antidriver-period', formatDateRange(context.period.from, context.period.to)));
  wrap.append(
    tabGroup(
      'Вид антидрайверов',
      [
        { value: 'ranking', label: 'Топ проблем' },
        { value: 'heatmap', label: 'Тепловая карта' },
      ],
      selectedAntidriverView,
      (value) => {
        selectedAntidriverView = value;
        renderAntidrivers(block, context);
      },
    ),
  );
  wrap.append(
    tabGroup(
      'Разрез антидрайверов',
      dimensions.map(({ key, title }) => ({ value: key, label: title })),
      selectedAntidriverDimension,
      (value) => {
        selectedAntidriverDimension = value;
        focusedAntidriver = null;
        renderAntidrivers(block, context);
      },
    ),
  );
  return wrap;
}

function sparkline(cells, tone) {
  const series = cells.map(({ voc }) => ({ voc }));
  const domain = chartDomain(series);
  const points = plotPoints(series, { width: 120, height: 32, ...domain });
  const svg = svgNode('svg', `antidriver-sparkline antidriver-sparkline--${tone}`, {
    viewBox: '0 0 120 32',
    'aria-hidden': 'true',
  });
  for (const path of linePaths(points)) svg.append(svgNode('path', 'antidriver-sparkline__line', { d: path }));
  return svg;
}

function impactTone(impact) {
  return impact < 0 ? 'negative' : 'positive';
}

function rankingRow(block, context, item, index, trend) {
  const label = context.label(selectedAntidriverDimension, item.key);
  const tone = impactTone(item.impact);
  const row = element('button', `antidriver-row antidriver-row--${tone}`);
  row.type = 'button';
  row.setAttribute('aria-controls', 'antidrivers-heatmap');
  row.setAttribute('aria-expanded', 'false');
  row.setAttribute(
    'aria-label',
    `${index + 1}. ${label}. Вклад ${formatImpact(roundImpact(item.impact))} VOC, ${tone === 'negative' ? 'тянет VOC вниз' : 'поддерживает VOC'}. Открыть тепловую карту`,
  );
  row.append(element('span', 'antidriver-row__rank', String(index + 1)));

  const copy = element('span', 'antidriver-row__copy');
  copy.append(
    element('span', 'antidriver-row__title', label),
    element('span', 'antidriver-row__detail', `VOC ${formatVoc(item.previousLevel)} → ${formatVoc(item.currentLevel)}`),
  );
  row.append(copy, sparkline(trend.cells, tone));

  const impact = element('span', 'antidriver-row__impact', formatImpact(roundImpact(item.impact)));
  impact.append(element('span', 'visually-hidden', tone === 'negative' ? ', тянет VOC вниз' : ', поддерживает VOC'));
  row.append(impact);
  row.addEventListener('click', () => {
    row.setAttribute('aria-expanded', 'true');
    focusedAntidriver = item.key;
    selectedAntidriverView = 'heatmap';
    renderAntidrivers(block, context);
  });
  return row;
}

function rankingView(block, context, ranking, heatmap) {
  const view = element('div', 'antidriver-ranking');
  const note = ranking.hasAntidrivers
    ? `${context.label(selectedAntidriverDimension, ranking.items[0].key)} — главный антидрайвер текущего периода`
    : 'Отрицательного вклада нет — ниже элементы с минимальным положительным вкладом';
  view.append(element('p', `antidriver-summary ${ranking.hasAntidrivers ? 'antidriver-summary--negative' : ''}`, note));

  const list = element('div', 'antidriver-list');
  ranking.items.forEach((item, index) => {
    const trend = heatmap.rows.find(({ key }) => key === item.key);
    list.append(rankingRow(block, context, item, index, trend));
  });
  view.append(list);
  return view;
}

function heatmapCell(context, row, column, cell, domain) {
  const label = context.label(selectedAntidriverDimension, row.key);
  const interval = column.from === column.to ? formatDate(column.from) : formatDateRange(column.from, column.to);
  const value = formatVoc(cell.voc);
  const node = element('span', `heatmap-cell heatmap-cell--${heatTone(cell.voc, domain)}`, value);
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', `${label}, ${interval}: VOC ${value}, ${formatCount(cell.mentions)} упоминаний`);
  node.title = `${interval} · VOC ${value} · ${formatCount(cell.mentions)} упоминаний`;
  return node;
}

function heatmapView(context, heatmap) {
  const view = element('div', 'antidriver-heatmap');
  view.id = 'antidrivers-heatmap';
  const scroll = element('div', 'heatmap-scroll');
  const table = element('table', 'heatmap');
  const head = element('thead');
  const headRow = element('tr');
  headRow.append(element('th', 'heatmap__row-title', 'Элемент'));
  for (const column of heatmap.columns) {
    headRow.append(element('th', 'heatmap__date', formatDate(column.from)));
  }
  head.append(headRow);

  const body = element('tbody');
  for (const row of heatmap.rows) {
    const isFocused = row.key === focusedAntidriver;
    const tr = element('tr', isFocused ? 'is-focused' : null);
    tr.setAttribute('aria-selected', String(isFocused));
    const title = element('th', 'heatmap__row-title', context.label(selectedAntidriverDimension, row.key));
    if (isFocused) title.append(element('span', 'visually-hidden', ', выбранный элемент'));
    tr.append(title);
    row.cells.forEach((cell, index) => {
      const td = element('td');
      td.append(heatmapCell(context, row, heatmap.columns[index], cell, heatmap.domain));
      tr.append(td);
    });
    body.append(tr);
  }
  table.append(head, body);
  scroll.append(table);
  view.append(scroll);
  return view;
}

function comparisonUnavailable() {
  const state = element('div', 'antidriver-unavailable');
  state.setAttribute('role', 'status');
  state.append(
    element('p', 'state__title', 'Нет данных предыдущего периода'),
    element('p', 'state__detail', 'Выберите период, для которого доступно сравнение.'),
  );
  return state;
}

function noContribution() {
  const state = element('div', 'antidriver-unavailable');
  state.setAttribute('role', 'status');
  state.append(
    element('p', 'state__title', 'Изменений нет'),
    element('p', 'state__detail', 'Вклад элементов выбранного разреза равен нулю.'),
  );
  return state;
}

export function renderAntidrivers(block, context) {
  block.setTitle('Антидрайверы');
  if (context.slice.length === 0) {
    block.setNote(null);
    block.setState(EMPTY);
    return;
  }

  const dimensions = DIMENSION_KEYS.map((key) => DIMENSIONS.find((dimension) => dimension.key === key)).filter(Boolean);
  if (!dimensions.some(({ key }) => key === selectedAntidriverDimension)) {
    selectedAntidriverDimension = dimensions[0].key;
  }
  const dimension = dimensions.find(({ key }) => key === selectedAntidriverDimension);
  const project = (row) => dimension.values(row, context.reference);
  const ranking = rankAntidrivers(context.previousSlice, context.slice, project);

  block.setNote(controls(block, context, dimensions));
  if (ranking.delta === null) {
    block.setContent(comparisonUnavailable());
    return;
  }
  if (ranking.items.length === 0) {
    block.setContent(noContribution());
    return;
  }

  const scale = recommendedScale(context.period);
  const heatmap = buildHeatmap(context.slice, context.period, scale, project, ranking.items.map(({ key }) => key));
  const content = selectedAntidriverView === 'heatmap'
    ? heatmapView(context, heatmap)
    : rankingView(block, context, ranking, heatmap);
  block.setContent(content);
  if (selectedAntidriverView === 'heatmap' && focusedAntidriver) {
    block.element.querySelector('.heatmap tr.is-focused .heatmap-cell')?.focus();
  }
}
