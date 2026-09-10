/*
  Каркас шапки: табы каналов, панель фильтров, источник данных и дата
  актуальности.

  Состав панели генерируется из доступных измерений (D-13), табы — из данных
  (D-01), подписи — через справочник с fallback на код (D-02).
*/

import { formatBuildTime, formatCount, formatDateRange } from './format.js';
import { CHANNEL_DIMENSION } from './dimensions.js';
import { SOURCE_FIXTURE } from './loader.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderChannels(channels, state, label, onChange) {
  const group = element('div', 'channels');
  group.setAttribute('role', 'tablist');
  group.setAttribute('aria-label', 'Канал');

  for (const channel of channels) {
    const tab = element('button', 'channels__tab', label(CHANNEL_DIMENSION, channel));
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(channel === state.channel));
    tab.addEventListener('click', () => onChange(channel));
    group.append(tab);
  }
  return group;
}

/*
  Разделитель декоративный: пустой и скрытый от screen reader. В макете внутри
  разделителей лежат подписи из другого состояния — их не переносим (V-04)
*/
function renderDivider() {
  const divider = element('span', 'filters__divider');
  divider.setAttribute('aria-hidden', 'true');
  return divider;
}

function filterCaption(dimension, state, label) {
  const selected = state.filters?.[dimension.key] ?? [];
  if (!selected.length) return dimension.allCaption;
  if (selected.length === 1) return label(dimension.key, selected[0]);
  return `${dimension.title}: ${formatCount(selected.length)}`;
}

function renderFilters(dimensions, state, label, period) {
  const bar = element('div', 'filters');

  const periodButton = element('button', 'filters__control filters__control--period');
  periodButton.type = 'button';
  periodButton.append(element('span', 'filters__control-label', formatDateRange(period.from, period.to)));
  periodButton.setAttribute('aria-label', `Период: ${formatDateRange(period.from, period.to)}`);
  bar.append(periodButton);

  for (const dimension of dimensions) {
    bar.append(renderDivider());
    const control = element('button', 'filters__control');
    control.type = 'button';
    control.dataset.dimension = dimension.key;
    control.setAttribute('aria-pressed', String(Boolean(state.filters?.[dimension.key]?.length)));
    control.append(element('span', 'filters__control-label', filterCaption(dimension, state, label)));
    bar.append(control);
  }
  return bar;
}

function renderSource(source, dataError) {
  if (source !== SOURCE_FIXTURE) {
    return element('span', 'source-badge', 'Данные выгрузки');
  }
  /* Явная пометка: молчаливый fallback маскирует сломанный pipeline */
  const badge = element('span', 'source-badge source-badge--demo');
  badge.append(element('span', 'source-badge__mark', 'Демо-данные'));
  badge.append(
    element('span', null, dataError ? 'выгрузка недоступна, показана фикстура' : 'показана фикстура'),
  );
  return badge;
}

export function renderHeader(host, context) {
  const { channels, dimensions, state, label, manifest, source, dataError, rowsInSlice, onChannelChange } =
    context;

  const head = element('header', 'shell-head');

  const bar = element('div', 'shell-head__bar');
  bar.append(renderChannels(channels, state, label, onChannelChange));
  bar.append(
    renderFilters(dimensions, state, label, {
      from: state.from ?? manifest.period?.from,
      to: state.to ?? manifest.period?.to,
    }),
  );
  head.append(bar);

  const meta = element('div', 'shell-head__meta');
  meta.append(renderSource(source, dataError));
  /* Дата актуальности — из манифеста (D-35) */
  meta.append(element('span', null, `Данные актуальны на ${formatBuildTime(manifest.generated_at)}`));
  meta.append(
    element(
      'span',
      null,
      `Выгрузка: ${formatDateRange(manifest.period?.from, manifest.period?.to)}, оценок в срезе: ${formatCount(rowsInSlice)}`,
    ),
  );
  head.append(meta);

  host.replaceChildren(head);
}
