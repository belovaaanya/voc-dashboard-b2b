/*
  Состояние дашборда живёт в query-параметрах и читается оттуда при загрузке —
  URL единственный источник состояния (D-31).
*/

import { DIMENSIONS } from './dimensions.js';
import { PRESETS } from './period.js';

const PARAM_CHANNEL = 'channel';
const PARAM_PRESET = 'preset';
const PARAM_FROM = 'from';
const PARAM_TO = 'to';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PRESETS = new Set([...PRESETS, 'custom']);

function readDate(params, name) {
  const value = params.get(name);
  return value && ISO_DATE.test(value) ? value : null;
}

export function readState(search = window.location.search) {
  const params = new URLSearchParams(search);
  const preset = params.get(PARAM_PRESET);
  const filters = {};
  for (const dimension of DIMENSIONS) {
    const raw = params.get(dimension.key);
    const values = raw ? raw.split(',').map((v) => v.trim()).filter(Boolean) : [];
    if (values.length) filters[dimension.key] = values;
  }
  return {
    channel: params.get(PARAM_CHANNEL) || null,
    preset: VALID_PRESETS.has(preset) ? preset : null,
    from: readDate(params, PARAM_FROM),
    to: readDate(params, PARAM_TO),
    filters,
  };
}

export function toSearch(state) {
  const params = new URLSearchParams();
  if (state.channel) params.set(PARAM_CHANNEL, state.channel);
  if (VALID_PRESETS.has(state.preset)) params.set(PARAM_PRESET, state.preset);
  if (state.from) params.set(PARAM_FROM, state.from);
  if (state.to) params.set(PARAM_TO, state.to);
  for (const dimension of DIMENSIONS) {
    const values = state.filters?.[dimension.key];
    if (values?.length) params.set(dimension.key, values.join(','));
  }
  const query = params.toString();
  return query ? `?${query}` : window.location.pathname;
}

export function writeState(state) {
  window.history.pushState(null, '', toSearch(state));
}

/*
  Достроенное по умолчанию состояние дописывается в URL без новой записи в
  истории: иначе пересланная ссылка без ?channel покажет получателю его первый
  канал, а не срез отправителя (D-31)
*/
export function syncState(state) {
  window.history.replaceState(null, '', toSearch(state));
}

export function onStateChange(handler) {
  window.addEventListener('popstate', () => handler(readState()));
}

/*
  Точечная замена одного измерения: блок, который ставит свой фильтр, не должен
  знать про остальные и уж тем более их пересобирать. Пустой список убирает
  параметр целиком — иначе в URL остаётся `segment=` без значения.
*/
export function withFilter(filters, dimension, values) {
  const next = { ...filters };
  if (values?.length) next[dimension] = values;
  else delete next[dimension];
  return next;
}
