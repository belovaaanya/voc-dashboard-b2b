/*
  Каркас шапки: табы каналов, панель фильтров, источник данных и дата
  актуальности.

  Состав панели генерируется из доступных измерений (D-13), табы — из данных
  (D-01), подписи — через справочник с fallback на код (D-02).
*/

import { formatBuildTime, formatCount, formatDateRange } from './format.js';
import { PERIOD_PRESETS, periodForPreset, toggleSelectedValue, validateCustomPeriod } from './controls.js';
import { CHANNEL_DIMENSION } from './dimensions.js';
import { element } from './dom.js';
import { SOURCE_FIXTURE } from './loader.js';

let activePopoverClose = null;

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

function bindPopover(item, trigger, panel) {
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panel.id);
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;

  const close = (returnFocus = false) => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', closeOnOutside);
    if (activePopoverClose === close) activePopoverClose = null;
    if (returnFocus) trigger.focus();
  };

  const closeOnOutside = (event) => {
    if (!item.contains(event.target)) close();
  };

  const open = () => {
    if (activePopoverClose && activePopoverClose !== close) activePopoverClose();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    activePopoverClose = close;
    document.addEventListener('pointerdown', closeOnOutside);
  };

  trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      close(true);
    }
  });

  return close;
}

function calendarIcon() {
  const icon = element('span', 'filters__calendar-icon');
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function dateField(name, labelText, value) {
  const label = element('label', 'control-popover__field');
  label.append(element('span', 'control-popover__field-label', labelText));
  const input = element('input', 'control-popover__date');
  input.type = 'date';
  input.name = name;
  input.required = true;
  input.value = value;
  label.append(input);
  return { label, input };
}

function periodControl(period, manifestPeriod, onChange) {
  const item = element('div', 'filters__item');
  const trigger = element('button', 'filters__control filters__control--period');
  trigger.type = 'button';
  trigger.append(element('span', 'filters__control-label', formatDateRange(period.from, period.to)), calendarIcon());
  trigger.setAttribute('aria-label', `Период: ${formatDateRange(period.from, period.to)}`);

  const panel = element('div', 'control-popover control-popover--period');
  panel.id = 'period-popover';
  panel.setAttribute('aria-label', 'Выбор периода');
  panel.append(element('h2', 'control-popover__title', 'Период'));

  const presets = element('div', 'control-popover__presets');
  let close;
  for (const preset of PERIOD_PRESETS) {
    const button = element('button', 'control-popover__preset', preset.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      close();
      onChange(periodForPreset(preset.value, manifestPeriod));
    });
    presets.append(button);
  }
  panel.append(presets);

  const form = element('form', 'control-popover__custom');
  form.append(element('h3', 'control-popover__subtitle', 'Свой диапазон'));
  const fields = element('div', 'control-popover__fields');
  const from = dateField('from', 'Начало', period.from);
  const to = dateField('to', 'Конец', period.to);
  fields.append(from.label, to.label);
  form.append(fields);

  const error = element('p', 'control-popover__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.append(error);

  const apply = element('button', 'control-popover__apply', 'Применить');
  apply.type = 'submit';
  form.append(apply);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateCustomPeriod(from.input.value, to.input.value);
    error.textContent = result.error ?? '';
    error.hidden = !result.error;
    if (!result.period) return;
    close();
    onChange(result.period);
  });
  for (const input of [from.input, to.input]) {
    input.addEventListener('input', () => {
      error.hidden = true;
    });
  }
  panel.append(form);

  item.append(trigger, panel);
  close = bindPopover(item, trigger, panel);
  return item;
}

function filterControl(dimension, state, label, onChange) {
  const item = element('div', 'filters__item');
  const selected = state.filters?.[dimension.key] ?? [];
  let draft = [...selected];

  const trigger = element('button', 'filters__control');
  trigger.type = 'button';
  trigger.dataset.dimension = dimension.key;
  trigger.dataset.active = String(selected.length > 0);
  trigger.append(element('span', 'filters__control-label', filterCaption(dimension, state, label)));

  const panel = element('div', 'control-popover');
  panel.id = `filter-${dimension.key}-popover`;
  panel.setAttribute('aria-label', `Фильтр: ${dimension.title}`);
  panel.append(element('h2', 'control-popover__title', dimension.title));

  const choices = element('fieldset', 'control-popover__choices');
  const legend = element('legend', 'visually-hidden', dimension.title);
  choices.append(legend);
  for (const [index, value] of dimension.options.entries()) {
    const option = element('label', 'control-popover__option');
    const input = element('input', 'control-popover__checkbox');
    input.type = 'checkbox';
    input.value = value;
    input.checked = selected.includes(value);
    input.id = `filter-${dimension.key}-${index}`;
    input.addEventListener('change', () => {
      draft = toggleSelectedValue(draft, value);
    });
    option.append(input, element('span', null, label(dimension.key, value)));
    choices.append(option);
  }
  panel.append(choices);

  const actions = element('div', 'control-popover__actions');
  const reset = element('button', 'control-popover__reset', 'Сбросить');
  reset.type = 'button';
  const apply = element('button', 'control-popover__apply', 'Применить');
  apply.type = 'button';
  let close;
  reset.addEventListener('click', () => {
    close();
    onChange(dimension.key, []);
  });
  apply.addEventListener('click', () => {
    close();
    onChange(dimension.key, draft);
  });
  actions.append(reset, apply);
  panel.append(actions);

  item.append(trigger, panel);
  close = bindPopover(item, trigger, panel);
  return item;
}

function renderFilters(dimensions, state, label, period, manifestPeriod, onPeriodChange, onFilterChange) {
  const bar = element('div', 'filters');
  bar.append(periodControl(period, manifestPeriod, onPeriodChange));

  for (const dimension of dimensions) {
    bar.append(renderDivider());
    bar.append(filterControl(dimension, state, label, onFilterChange));
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
  const {
    channels,
    dimensions,
    state,
    period,
    label,
    manifest,
    source,
    dataError,
    rowsInSlice,
    onChannelChange,
    onPeriodChange,
    onFilterChange,
  } = context;

  const head = element('header', 'shell-head');

  const bar = element('div', 'shell-head__bar');
  bar.append(renderChannels(channels, state, label, onChannelChange));
  /* Период — тот же разрешённый период, по которому считают карточки: иначе шапка и цифры расходятся */
  bar.append(
    renderFilters(dimensions, state, label, period, manifest.period, onPeriodChange, onFilterChange),
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
