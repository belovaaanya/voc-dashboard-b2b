import { EMPTY, ERROR, LOADING } from '../block.js';
import { linePaths, plotPoints } from '../chart-geometry.js';
import { element } from '../dom.js';
import { formatImpact, formatShare } from '../format.js';
import { roundImpact } from '../round.js';
import { buildProblemCards } from '../verbatim.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
let selectedMode = 'frequent';

function svgNode(tag, className, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute('class', className);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function modeTabs(block, context) {
  const group = element('span', 'verbatim-tabs');
  group.setAttribute('role', 'tablist');
  group.setAttribute('aria-label', 'Вид прямой речи');
  for (const option of [
    { value: 'frequent', label: 'Частотные' },
    { value: 'emerging', label: 'Новые' },
  ]) {
    const tab = element('button', 'verbatim-tabs__tab', option.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(option.value === selectedMode));
    tab.addEventListener('click', () => {
      selectedMode = option.value;
      renderVerbatimCards(block, context);
    });
    group.append(tab);
  }
  return group;
}

function headerControls(block, context) {
  const controls = element('span', 'verbatim-head-controls');
  controls.append(modeTabs(block, context), element('span', 'verbatim-ai', '✦ Сделано с AI'));
  return controls;
}

function sparkline(item, tone) {
  const series = item.trend.map(({ share }) => ({ voc: share }));
  const points = plotPoints(series, { width: 91, height: 32, ...item.trendDomain });
  const svg = svgNode('svg', `verbatim-sparkline verbatim-sparkline--${tone}`, {
    viewBox: '0 0 91 32',
    'aria-hidden': 'true',
  });
  for (const path of linePaths(points)) svg.append(svgNode('path', 'verbatim-sparkline__line', { d: path }));
  return svg;
}

function trendDirection(delta) {
  if (delta > 0) return { tone: 'up', arrow: '↗', label: 'доля выросла' };
  if (delta < 0) return { tone: 'down', arrow: '↘', label: 'доля снизилась' };
  return { tone: 'flat', arrow: '→', label: 'доля без изменения' };
}

function problemCard(item) {
  const impactTone = item.impact < 0 ? 'negative' : 'positive';
  const trend = trendDirection(item.shareDelta);
  const card = element('article', `verbatim-card verbatim-card--${impactTone}`);
  card.setAttribute('tabindex', '0');
  card.setAttribute(
    'aria-label',
    `${item.category}. ${formatShare(item.currentShare)}, ${trend.label}. Цитата: ${item.quote} Влияние на VOC ${formatImpact(roundImpact(item.impact))}`,
  );
  card.title = item.quote;

  const head = element('div', 'verbatim-card__head');
  head.append(element('span', 'verbatim-card__tag', item.category));
  const share = element('span', `verbatim-card__share verbatim-card__share--${trend.tone}`);
  share.append(element('strong', null, formatShare(item.currentShare)), element('span', null, trend.arrow));
  share.append(element('small', null, 'Доля от ОС'));
  head.append(share);

  const quote = element('blockquote', 'verbatim-card__quote', `“${item.quote}”`);
  const trendRow = element('div', 'verbatim-card__trend');
  trendRow.append(element('span', null, 'Тренд'), sparkline(item, impactTone));
  const impact = element('div', 'verbatim-card__impact');
  impact.append(
    element('span', null, 'Влияние на VOC'),
    element('strong', null, formatImpact(roundImpact(item.impact))),
  );
  card.append(head, quote, trendRow, impact);
  return card;
}

function unavailable(message, detail) {
  const state = element('div', 'verbatim-unavailable');
  state.setAttribute('role', 'status');
  state.append(element('p', 'state__title', message), element('p', 'state__detail', detail));
  return state;
}

export function renderVerbatimCards(block, context) {
  block.setNote(headerControls(block, context));
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

  const cards = buildProblemCards(
    context.previousSlice,
    context.slice,
    context.period,
    context.verbatim.data,
    selectedMode,
  );
  if (!cards.length) {
    block.setContent(unavailable(
      selectedMode === 'emerging' ? 'Новых тем в этом периоде нет' : 'Нет размеченной прямой речи',
      'Для выбранного среза нет комментариев с категорией проблемы.',
    ));
    return;
  }

  const list = element('div', 'verbatim-cards');
  for (const item of cards) list.append(problemCard(item));
  block.setContent(list);
}
