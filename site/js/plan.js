/**
 * Плановый коридор: какая запись `reference.plan` описывает срез и как по ней
 * читается бейдж (`D-03`, `D-04`, `D-22`, `D-42`).
 *
 * Правило живёт здесь целиком, потому что его применяют и карточка канала, и
 * сегментные карточки: разъехавшись, они дали бы разный бейдж на одном числе.
 */

import { roundVoc } from './round.js';

export const IN_PLAN = 'in';
export const ABOVE_PLAN = 'above';
export const BELOW_PLAN = 'below';

/**
 * Коридор описан парой (канал, сегмент). Любой другой фильтр сужает срез так,
 * что канальный коридор к нему уже не относится, — бейджа нет, как и при
 * незаполненном плане (`D-42`, тот же принцип, что `D-04`).
 */
function narrowsBeyondSegment(filters) {
  return Object.entries(filters ?? {}).some(([key, values]) => key !== 'segment' && values?.length);
}

/**
 * Запись обязана покрывать выбранный период целиком: период, задевающий два
 * коридора, не описан ни одним из них.
 */
export function planFor(plans, { channel, segment = null, from, to, filters } = {}) {
  if (!Array.isArray(plans) || !channel || !from || !to) return null;
  if (narrowsBeyondSegment(filters)) return null;

  return (
    plans.find(
      (plan) =>
        plan?.channel === channel &&
        (plan.segment ?? null) === segment &&
        plan.period_from <= from &&
        to <= plan.period_to,
    ) ?? null
  );
}

/**
 * Коридор под текущий срез: сегмент берётся из фильтра. Два и более выбранных
 * сегмента коридора не имеют — «ММБ + СБ» это не канал и не сегмент.
 */
export function planForSlice(plans, { channel, from, to, filters } = {}) {
  const chosen = filters?.segment ?? [];
  if (chosen.length > 1) return null;
  return planFor(plans, { channel, segment: chosen[0] ?? null, from, to, filters });
}

/**
 * Сравнение идёт по значению, округлённому до отображаемых знаков, границы
 * включительно (`D-22`). Границы округляются тем же правилом: подпись коридора
 * показывает их с двумя знаками, и сравнение с неокруглённой границей
 * противоречило бы собственной подписи.
 */
export function planStatus(value, plan) {
  const shown = roundVoc(value);
  const min = roundVoc(plan?.min);
  const max = roundVoc(plan?.max);
  if (shown === null || min === null || max === null) return null;

  if (shown < min) return BELOW_PLAN;
  return shown > max ? ABOVE_PLAN : IN_PLAN;
}
