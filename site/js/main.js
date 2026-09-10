/*
  Сборка каркаса. Блоки создаются один раз, при смене состояния меняется только
  их содержимое.

  Что здесь ещё нет: график динамики, тепловая карта, значения метрик, топ
  проблем, прямая речь, инсайты — следующие слайсы встают в эти же блоки.
*/

import { EMPTY, ERROR, LOADING, READY, createBlock } from './block.js';
import { availableDimensions, channelsOf } from './dimensions.js';
import { renderHeader } from './header.js';
import { createLabels } from './labels.js';
import { loadRatings, loadSource } from './loader.js';
import { onStateChange, readState, writeState } from './url-state.js';

const NEXT_SLICE = 'Блок появится в следующем слайсе — здесь только каркас.';

const BLOCKS = [
  { id: 'voc-channel', title: 'VOC канала', host: 'metrics', modifier: 'card--metric' },
  { id: 'voc-segment-1', title: 'VOC сегмента', host: 'metrics', modifier: 'card--metric' },
  { id: 'voc-segment-2', title: 'VOC сегмента', host: 'metrics', modifier: 'card--metric' },
  { id: 'voc-segment-3', title: 'VOC сегмента', host: 'metrics', modifier: 'card--metric' },
  { id: 'summary', title: 'Главный вывод', host: 'rail-top' },
  { id: 'dynamics', title: 'Динамика VOC', host: 'main' },
  { id: 'antidrivers', title: 'Антидрайверы', host: 'main' },
  { id: 'insights', title: 'Инсайты', host: 'rail-main' },
];

function inPeriod(row, state) {
  if (state.from && row.appeal_date < state.from) return false;
  if (state.to && row.appeal_date > state.to) return false;
  return true;
}

function matchesFilters(row, state, dimensions) {
  for (const dimension of dimensions) {
    const selected = state.filters?.[dimension.key];
    if (!selected?.length) continue;
    const values = dimension.values(row).filter(Boolean);
    if (!values.some((value) => selected.includes(value))) return false;
  }
  return true;
}

function slice(rows, state, dimensions) {
  return rows.filter(
    (row) =>
      (!state.channel || row.channel === state.channel) &&
      inPeriod(row, state) &&
      matchesFilters(row, state, dimensions),
  );
}

function main() {
  const hosts = {
    header: document.getElementById('header'),
    metrics: document.getElementById('metrics'),
    'rail-top': document.getElementById('rail-top'),
    main: document.getElementById('main'),
    'rail-main': document.getElementById('rail-main'),
  };

  const blocks = new Map();
  for (const spec of BLOCKS) {
    const block = createBlock(spec);
    blocks.set(spec.id, block);
    hosts[spec.host].append(block.element);
  }

  const setAll = (state, detail) => {
    for (const block of blocks.values()) block.setState(state, detail);
  };

  setAll(LOADING);

  loadSource()
    .then(async (source) => {
      const rows = await loadRatings(source);
      if (!Array.isArray(rows)) throw new Error('ratings: ожидался массив объектов (data-model §7)');

      const label = createLabels(source.manifest);
      const dimensions = availableDimensions(rows);
      const channels = channelsOf(rows);

      /*
        Заголовки сегментных карточек — из данных и справочника подписей (D-01, D-02).
        Порядок по числу оценок: так крупный сегмент идёт первым, как в макете
      */
      const volumeBySegment = new Map();
      for (const row of rows) {
        if (row.segment) volumeBySegment.set(row.segment, (volumeBySegment.get(row.segment) ?? 0) + 1);
      }
      const segments = [...volumeBySegment.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);
      segments.slice(0, 3).forEach((segment, index) => {
        blocks.get(`voc-segment-${index + 1}`).setTitle(`VOC ${label('segment', segment)}`);
      });

      const render = (state) => {
        const active = state.channel && channels.includes(state.channel) ? state : { ...state, channel: channels[0] ?? null };
        const rowsInSlice = slice(rows, active, dimensions);
        blocks.get('voc-channel').setTitle(active.channel ? `VOC ${label('channel', active.channel)}` : 'VOC канала');

        renderHeader(hosts.header, {
          channels,
          dimensions,
          state: active,
          label,
          manifest: source.manifest,
          source: source.source,
          dataError: source.dataError,
          rowsInSlice: rowsInSlice.length,
          onChannelChange: (channel) => {
            const next = { ...active, channel };
            writeState(next);
            render(next);
          },
        });

        setAll(rowsInSlice.length ? READY : EMPTY, rowsInSlice.length ? NEXT_SLICE : undefined);
      };

      render(readState());
      onStateChange(render);
    })
    .catch((error) => {
      /* Шапка тоже строится из данных, поэтому при их отсутствии несёт только диагностику */
      const notice = document.createElement('p');
      notice.className = 'state__title';
      notice.textContent = 'Данные не загрузились — дашборд показан без шапки';
      hosts.header.replaceChildren(notice);
      setAll(ERROR, error.message);
    });
}

main();
