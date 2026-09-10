/*
  Сегментная карточка: VOC сегмента, дельта, объём — и фильтр по сегменту
  по клику (P0 №7, D-31).

  Карточка считает свой срез **без** фильтра по сегменту (D-43): иначе после
  первого же клика три карточки из четырёх показывают «нет данных», и выбрать
  другой сегмент становится нечем.
*/

import { EMPTY } from '../block.js';
import { appendAll, element } from '../dom.js';
import { formatVoc } from '../format.js';
import { voc, vocDelta } from '../metrics.js';
import { planForSegment } from '../plan.js';
import { withFilter } from '../url-state.js';
import { badgeNode, countNode, deltaNode, sufficiencyNode, valueNode } from './metric-card.js';

const SEGMENT = 'segment';

/** Реестр держит по строке на карточку, а сегмент карточки — её порядковый номер в данных. */
export function vocSegment(index) {
  return (block, context) => render(block, context, index);
}

function render(block, context, index) {
  const { segments, state, period, reference, label, select, setState } = context;
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

  const value = voc(rows);
  /* Выбрана — когда фильтр равен ровно этому сегменту: при двух выбранных ни одна карточка не «нажата» */
  const chosen = state.filters?.[SEGMENT] ?? [];
  const selected = chosen.length === 1 && chosen[0] === code;

  block.setNote(
    badgeNode(
      value,
      planForSegment(reference?.plan, {
        channel: state.channel,
        segment: code,
        from: period.from,
        to: period.to,
        filters: state.filters,
      }),
    ),
  );

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

  appendAll(
    toggle,
    deltaNode(vocDelta(rows, previous)),
    valueNode(formatVoc(value)),
    countNode(rows.length),
    sufficiencyNode(rows),
    /* Что карточка управляет фильтром, сказано словом: рамка и фон сами по себе об этом не сообщают */
    element('span', 'metric__filter', selected ? 'Фильтр применён' : 'Фильтр по сегменту'),
  );

  block.setContent(toggle);
}
