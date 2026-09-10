/*
  Сегментная карточка: VOC сегмента, дельта, объём — и фильтр по сегменту
  по клику (P0 №7, D-31).

  Композиция — `MetricCell/Small` из wireframe (design-spec §3.2): заголовок и
  точка тренда в шапке, значение слева внизу, дельта и объём колонкой справа.
  Планового бейджа в малой карточке нет — в макете коридор показан только у
  карточки канала. Геометрия наша (V-01…V-03).

  Карточка считает свой срез **без** фильтра по сегменту (D-43): иначе после
  первого же клика три карточки из четырёх показывают «нет данных», и выбрать
  другой сегмент становится нечем.
*/

import { EMPTY } from '../block.js';
import { appendAll, element } from '../dom.js';
import { formatVoc } from '../format.js';
import { voc, vocDelta } from '../metrics.js';
import { withFilter } from '../url-state.js';
import { countNode, deltaNode, sufficiencyNode, trendDotNode, valueNode } from './metric-card.js';

const SEGMENT = 'segment';

/** Реестр держит по строке на карточку, а сегмент карточки — её порядковый номер в данных. */
export function vocSegment(index) {
  return (block, context) => render(block, context, index);
}

function render(block, context, index) {
  const { segments, state, label, select, setState } = context;
  const code = segments[index];

  block.setNote(null);
  if (!code) {
    block.setState(EMPTY, 'Сегмента нет в выгрузке.');
    return;
  }

  block.setTitle(`VOC ${label(SEGMENT, code)}`);

  const { rows, previous } = select({ filters: withFilter(state.filters, SEGMENT, [code]) });
  if (rows.length === 0) {
    block.setState(EMPTY);
    return;
  }

  const delta = vocDelta(rows, previous);
  block.setNote(trendDotNode(delta));

  /* Выбрана — когда фильтр равен ровно этому сегменту: при двух выбранных ни одна карточка не «нажата» */
  const chosen = state.filters?.[SEGMENT] ?? [];
  const selected = chosen.length === 1 && chosen[0] === code;

  const toggle = element('button', 'metric metric--segment metric__toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', String(selected));
  toggle.setAttribute(
    'aria-label',
    selected ? 'Снять фильтр по сегменту' : 'Отфильтровать дашборд по сегменту',
  );
  toggle.addEventListener('click', () => {
    setState({
      ...state,
      filters: withFilter(state.filters, SEGMENT, selected ? [] : [code]),
    });
  });

  const columns = element('span', 'metric__columns');
  columns.append(appendAll(element('span', 'metric__main'), valueNode(formatVoc(voc(rows)))));
  columns.append(appendAll(element('span', 'metric__aside'), deltaNode(delta), countNode(rows.length)));

  /* Пометка выборки идёт под обеими колонками: в узкой колонке она переплетается с объёмом */
  appendAll(toggle, columns, sufficiencyNode(rows));

  block.setContent(toggle);
}
