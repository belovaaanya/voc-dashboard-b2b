import { EMPTY } from '../block.js';
import { element } from '../dom.js';
import { formatDate, formatDelta, formatVoc } from '../format.js';
import { buildInsights, sortInsights } from '../insights.js';
import { roundDelta, roundVoc } from '../round.js';

let selectedInsightSort = 'influence';

function sortControls(block, context) {
  const group = element('div', 'insight-sort');
  group.setAttribute('role', 'tablist');
  group.setAttribute('aria-label', 'Сортировка инсайтов');
  for (const option of [
    { value: 'influence', label: 'Влияние' },
    { value: 'chronology', label: 'Хронология' },
  ]) {
    const button = element('button', 'insight-sort__tab', option.label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(option.value === selectedInsightSort));
    button.addEventListener('click', () => {
      selectedInsightSort = option.value;
      renderInsights(block, context);
    });
    group.append(button);
  }
  return group;
}

function insightRow(block, context, insight) {
  const selected = context.state.focus === insight.date;
  const kindLabel = insight.kind === 'fall' ? 'Падение' : 'Рост';
  const row = element('button', `insight-row insight-row--${insight.kind}`);
  row.type = 'button';
  row.setAttribute('data-focus-date', insight.date);
  row.setAttribute('aria-pressed', String(selected));
  row.setAttribute(
    'aria-label',
    `${formatDate(insight.date)}. ${kindLabel} VOC ${formatDelta(roundDelta(insight.delta))}. VOC ${formatVoc(roundVoc(insight.voc))}. ${insight.cause ? `Основная причина: ${insight.cause}` : 'Причина не выделяется'}`,
  );

  const headline = element('span', 'insight-row__headline');
  headline.append(
    element('span', 'insight-row__dot'),
    element('span', 'insight-row__date', formatDate(insight.date)),
    element('span', 'insight-row__kind', kindLabel),
    element('span', 'insight-row__delta', formatDelta(roundDelta(insight.delta))),
  );
  const detail = element('span', 'insight-row__detail');
  detail.append(
    element('span', 'insight-row__cause', insight.cause || 'Причина не выделяется'),
    element('span', 'insight-row__voc', `VOC ${formatVoc(roundVoc(insight.voc))}`),
  );
  row.append(headline, detail);
  row.addEventListener('click', () => {
    context.setState({ ...context.state, focus: selected ? null : insight.date });
    block.element.querySelector(`[data-focus-date="${insight.date}"]`)?.focus();
  });
  return row;
}

function noChanges() {
  const state = element('div', 'insight-unavailable');
  state.setAttribute('role', 'status');
  state.append(
    element('p', 'state__title', 'Нет сопоставимых изменений'),
    element('p', 'state__detail', 'Для выбранного среза нет дней с заметным изменением VOC к предыдущему периоду.'),
  );
  return state;
}

export function renderInsights(block, context) {
  block.setTitle('Инсайты');
  block.setNote(element('span', 'insight-ai', '✦ Сделано с AI'));
  if (context.slice.length === 0) {
    block.setState(EMPTY);
    return;
  }

  const project = (row) => [row.problem || 'Без разметки'];
  const insights = sortInsights(
    buildInsights(context.previousSlice, context.slice, context.previousPeriod, context.period, project),
    selectedInsightSort,
  );
  if (insights.length === 0) {
    const content = element('div', 'insights');
    content.append(sortControls(block, context), noChanges());
    block.setContent(content);
    return;
  }

  const content = element('div', 'insights');
  const list = element('div', 'insight-list');
  for (const insight of insights.slice(0, 10)) list.append(insightRow(block, context, insight));
  content.append(sortControls(block, context), list);
  block.setContent(content);
}
