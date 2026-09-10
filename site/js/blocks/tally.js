/*
  Вторая строка метрик: `Оценок`, `Низких оценок`, `Доля 5★` (D-15).

  Композиция — из расширенного варианта макета (`V-10a`, `V-25`): заголовок и
  точка тренда в шапке, крупное значение и мелкая дельта рядом с ним.
  В wireframe этой строки нет, а её скрытый слой источником геометрии не
  является.

  `Стабильность`, `Конверсия в опрос` и `Покрытие` из того же варианта здесь
  отсутствуют намеренно: источника в выгрузке у них нет.
*/

import { EMPTY } from '../block.js';
import { element } from '../dom.js';
import { formatCount, formatShare } from '../format.js';
import { deltaOf, summarize } from '../metrics.js';
import { DELTA_SHAPES, deltaNode, trendDotNode, valueNode } from './metric-card.js';

const TALLIES = {
  count: { read: (summary) => summary.count, format: formatCount, shape: DELTA_SHAPES.count },
  lowCount: { read: (summary) => summary.lowCount, format: formatCount, shape: DELTA_SHAPES.count },
  share5: { read: (summary) => summary.share5, format: formatShare, shape: DELTA_SHAPES.share },
};

/** Реестр держит по строке на карточку, а показатель карточки — ключ из `TALLIES`. */
export function tally(key) {
  return (block, context) => render(block, context, TALLIES[key]);
}

function render(block, context, spec) {
  const { slice, previousSlice } = context;

  block.setNote(null);
  if (slice.length === 0) {
    block.setState(EMPTY);
    return;
  }

  const value = spec.read(summarize(slice));
  /* Пустой предыдущий срез — сравнивать не с чем: «+10 459» там читалось бы как рост с нуля */
  const delta = previousSlice.length === 0 ? null : deltaOf(value, spec.read(summarize(previousSlice)));

  block.setNote(trendDotNode(delta, spec.shape));

  const layout = element('div', 'metric metric--tally');
  layout.append(valueNode(spec.format(value)));
  const trend = deltaNode(delta, spec.shape);
  if (trend) layout.append(trend);

  block.setContent(layout);
}
