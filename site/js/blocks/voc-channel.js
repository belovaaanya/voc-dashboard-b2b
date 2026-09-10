/*
  Большая карточка: VOC текущего среза, объём, дельта к предыдущему
  аналогичному периоду и плановый коридор канала.

  Композиция — `MetricCell/Big` из wireframe (design-spec §3.1): заголовок и
  бейдж в шапке, дельта под бейджем справа, крупное значение слева внизу,
  коридор и объём — справа от него. Геометрия наша (V-01…V-03).

  Заголовок ставит сама карточка: он обязан называть тот же срез, который
  показан числом. «VOC канала» над значением одного сегмента — то же
  противоречие интерфейса самому себе, от которого защищает D-22.
*/

import { EMPTY } from '../block.js';
import { CHANNEL_DIMENSION } from '../dimensions.js';
import { appendAll, element } from '../dom.js';
import { formatVoc } from '../format.js';
import { voc, vocDelta } from '../metrics.js';
import { planForSlice } from '../plan.js';
import {
  badgeNode,
  countNode,
  deltaNode,
  planCaptionNode,
  sufficiencyNode,
  valueNode,
} from './metric-card.js';

/** Заголовок называет срез: канал, а при сужении фильтром — ещё и его. */
function titleOf(state, label, dimensions) {
  const base = state.channel ? `VOC ${label(CHANNEL_DIMENSION, state.channel)}` : 'VOC канала';
  const applied = dimensions
    .map((dimension) => state.filters?.[dimension.key] ?? [])
    .filter((values) => values.length);

  if (applied.length === 0) return base;
  const single = state.filters?.segment ?? [];
  return applied.length === 1 && single.length === 1
    ? `${base}, ${label('segment', single[0])}`
    : `${base}, срез по фильтрам`;
}

export function renderVocChannel(block, context) {
  const { slice, previousSlice, state, period, reference, label, dimensions } = context;

  block.setTitle(titleOf(state, label, dimensions));
  /* Бейдж живёт в шапке карточки и обязан исчезать вместе с содержимым */
  block.setNote(null);
  if (slice.length === 0) {
    block.setState(EMPTY);
    return;
  }

  const value = voc(slice);
  const plan = planForSlice(reference?.plan, {
    channel: state.channel,
    from: period.from,
    to: period.to,
    filters: state.filters,
  });

  block.setNote(badgeNode(value, plan));

  /* Дельта стоит под бейджем отдельной строкой, значение и служебные подписи — рядом (§3.1) */
  const layout = element('div', 'metric metric--big');
  appendAll(layout, deltaNode(vocDelta(slice, previousSlice), undefined, 'trend--lead'));

  const row = element('div', 'metric__row');
  row.append(valueNode(formatVoc(value), 'metric__value--big'));
  row.append(appendAll(element('div', 'metric__aside'), planCaptionNode(plan), countNode(slice.length)));
  layout.append(row);

  appendAll(layout, sufficiencyNode(slice));
  block.setContent(layout);
}
