/*
  Вторая строка метрик: `Оценок`, `Низких оценок`, `Доля 5★` (D-15).

  `Стабильность`, `Конверсия в опрос` и `Покрытие` из расширенного варианта
  макета здесь отсутствуют намеренно: источника в выгрузке у них нет.
*/

import { EMPTY } from '../block.js';
import { element } from '../dom.js';
import { formatCount, formatShare } from '../format.js';
import { summarize } from '../metrics.js';
import { valueNode } from './metric-card.js';

const TALLIES = {
  count: { read: (summary) => summary.count, format: formatCount },
  lowCount: { read: (summary) => summary.lowCount, format: formatCount },
  share5: { read: (summary) => summary.share5, format: formatShare },
};

/** Реестр держит по строке на карточку, а показатель карточки — ключ из `TALLIES`. */
export function tally(key) {
  return (block, context) => render(block, context, TALLIES[key]);
}

function render(block, context, spec) {
  const { slice } = context;

  block.setNote(null);
  if (slice.length === 0) {
    block.setState(EMPTY);
    return;
  }

  const layout = element('div', 'metric metric--tally');
  layout.append(valueNode(spec.format(spec.read(summarize(slice)))));
  block.setContent(layout);
}
