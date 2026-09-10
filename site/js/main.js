/*
  Сборка каркаса и реестр блоков.

  Блок — модуль `blocks/<id>.js` с функцией `render(block, context)`. Реестр
  ниже — единственное место, где блок объявляется, и все блоки получают **один
  и тот же** объект контекста: разойтись в том, что считает срез, они не могут
  по построению. Контракт контекста — docs/ui-shell.md.

  Добавить блок = новый файл и одна строка в BLOCKS. Строки без `render` —
  места следующих слайсов.
*/

import { EMPTY, ERROR, LOADING, READY, createBlock } from './block.js';
import { renderVocChannel } from './blocks/voc-channel.js';
import { vocSegment } from './blocks/voc-segment.js';
import { tally } from './blocks/tally.js';
import { availableDimensions, channelsOf } from './dimensions.js';
import { periodFromState } from './controls.js';
import { renderHeader } from './header.js';
import { createLabels } from './labels.js';
import { hasRole, loadRatings, loadReference, loadSource } from './loader.js';
import { groupBy } from './metrics.js';
import { defaultPeriod } from './period.js';
import { createSelector } from './selection.js';
import { onStateChange, readState, syncState, toSearch, withFilter, writeState } from './url-state.js';

const NEXT_SLICE = 'Блок появится в следующем слайсе — здесь только каркас.';

const BLOCKS = [
  { id: 'voc-channel', title: 'VOC канала', host: 'metrics', modifier: 'card--metric card--metric-big', render: renderVocChannel },
  { id: 'voc-segment-1', title: 'VOC сегмента', host: 'metrics', modifier: 'card--metric', render: vocSegment(0) },
  { id: 'voc-segment-2', title: 'VOC сегмента', host: 'metrics', modifier: 'card--metric', render: vocSegment(1) },
  { id: 'voc-segment-3', title: 'VOC сегмента', host: 'metrics', modifier: 'card--metric', render: vocSegment(2) },
  { id: 'ratings-count', title: 'Оценок', host: 'metrics', modifier: 'card--metric card--metric-tally', render: tally('count') },
  { id: 'low-ratings', title: 'Низких оценок', host: 'metrics', modifier: 'card--metric card--metric-tally', render: tally('lowCount') },
  { id: 'share-5', title: 'Доля 5★', host: 'metrics', modifier: 'card--metric card--metric-tally', render: tally('share5') },
  { id: 'summary', title: 'Главный вывод', host: 'rail-top' },
  { id: 'dynamics', title: 'Динамика VOC', host: 'main' },
  { id: 'antidrivers', title: 'Антидрайверы', host: 'main' },
  { id: 'insights', title: 'Инсайты', host: 'rail-main' },
];

/* Порядок сегментных карточек — по числу оценок: крупный сегмент идёт первым, как в макете (D-01) */
function segmentsByVolume(rows) {
  return groupBy(rows.filter((row) => row.segment), (row) => row.segment)
    .sort((left, right) => right.ratings.length - left.ratings.length)
    .map((group) => group.key);
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
    for (const block of blocks.values()) {
      block.setNote(null);
      block.setState(state, detail);
    }
  };

  setAll(LOADING);

  loadSource()
    .then(async (source) => {
      /* reference грузится вместе с ratings: без него нет ни подписей, ни разрезов КП/Продукты */
      const [rows, reference] = await Promise.all([
        loadRatings(source),
        hasRole(source, 'reference') ? loadReference(source) : Promise.resolve(null),
      ]);
      if (!Array.isArray(rows)) throw new Error('ratings: ожидался массив объектов (data-model §7)');

      const label = createLabels(reference);
      const dimensions = availableDimensions(rows, reference);
      const channels = channelsOf(rows);
      const segments = segmentsByVolume(rows);
      /* Период по умолчанию — из манифеста, а не из часов машины (D-41) */
      const fallbackPeriod = defaultPeriod(source.manifest.period);

      function render(requested) {
        const period = periodFromState(requested, fallbackPeriod, source.manifest.period);
        const state = {
          ...requested,
          channel: requested.channel && channels.includes(requested.channel) ? requested.channel : channels[0] ?? null,
          preset: period.preset,
          from: period.from,
          to: period.to,
        };
        /* Достроенное по умолчанию состояние дописывается в URL: пересланная ссылка обязана быть полной (D-31) */
        if (toSearch(state) !== toSearch(requested)) syncState(state);

        const select = createSelector({ rows, state, period, dimensions, reference });
        const current = select();

        const setState = (next) => {
          writeState(next);
          renderSafely(next);
        };

        const context = {
          rows,
          slice: current.rows,
          previousSlice: current.previous,
          state,
          period,
          previousPeriod: current.previousPeriod,
          reference,
          label,
          dimensions,
          segments,
          select,
          setState,
        };

        renderHeader(hosts.header, {
          channels,
          dimensions,
          state,
          period,
          label,
          manifest: source.manifest,
          source: source.source,
          dataError: source.dataError,
          rowsInSlice: context.slice.length,
          onChannelChange: (channel) => setState({ ...state, channel }),
          onPeriodChange: (nextPeriod) =>
            setState({ ...state, preset: nextPeriod.preset, from: nextPeriod.from, to: nextPeriod.to }),
          onFilterChange: (dimension, values) =>
            setState({ ...state, filters: withFilter(state.filters, dimension, values) }),
        });

        for (const spec of BLOCKS) {
          const block = blocks.get(spec.id);
          if (spec.render) spec.render(block, context);
          else block.setState(context.slice.length ? READY : EMPTY, context.slice.length ? NEXT_SLICE : undefined);
        }
      }

      /*
        Период живёт в URL и правится руками (D-31), поэтому вывернутый диапазон
        приходит и после загрузки — на popstate. Ядро на нём падает намеренно,
        и падение обязано стать состоянием ошибки, а не необработанным исключением
      */
      function renderSafely(state) {
        try {
          render(state);
        } catch (error) {
          setAll(ERROR, error.message);
        }
      }

      renderSafely(readState());
      onStateChange(renderSafely);
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
