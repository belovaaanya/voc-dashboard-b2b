/*
  Общие части карточки метрики: дельта со стрелкой, бейдж плана, подпись
  коридора, объём и пометка недостаточной выборки.

  Здесь только представление. Ни одного расчёта: значения приходят из
  metrics.js, plan.js и sufficiency.js, строки — из format.js (D-20).
*/

import { element } from '../dom.js';
import { formatCount, formatDelta, formatVoc } from '../format.js';
import { trendOf } from '../metrics.js';
import { ABOVE_PLAN, BELOW_PLAN, IN_PLAN, planStatus } from '../plan.js';
import { sampleSufficiency } from '../sufficiency.js';

/* Стрелка и слово обязательны: цвет не единственный носитель смысла (D-26) */
const TREND = {
  up: { arrow: '↗', caption: 'рост к предыдущему периоду', modifier: 'trend--up' },
  down: { arrow: '↘', caption: 'падение к предыдущему периоду', modifier: 'trend--down' },
  flat: { arrow: '→', caption: 'без изменений к предыдущему периоду', modifier: 'trend--flat' },
};

const PLAN_BADGE = {
  [IN_PLAN]: { caption: 'В плане', modifier: 'badge--in' },
  [ABOVE_PLAN]: { caption: 'Выше плана', modifier: 'badge--above' },
  [BELOW_PLAN]: { caption: 'Ниже плана', modifier: 'badge--below' },
};

export function valueNode(text, modifier) {
  return element('span', modifier ? `metric__value ${modifier}` : 'metric__value', text);
}

/** Направление берётся из знака дельты, а не задаётся отдельно (V-15). */
export function deltaNode(delta) {
  const trend = trendOf(delta);
  if (!trend) return null;

  const { arrow, caption, modifier } = TREND[trend];
  const node = element('span', `trend ${modifier}`);
  node.append(element('span', 'trend__value', formatDelta(delta)));

  const glyph = element('span', 'trend__arrow', arrow);
  glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph);
  node.append(element('span', 'visually-hidden', `, ${caption}`));
  return node;
}

export function badgeNode(value, plan) {
  const status = planStatus(value, plan);
  if (!status) return null;

  const { caption, modifier } = PLAN_BADGE[status];
  return element('span', `badge ${modifier}`, caption);
}

export function planCaptionNode(plan) {
  if (!plan) return null;
  return element('span', 'metric__meta', `План: ${formatVoc(plan.min)} - ${formatVoc(plan.max)}`);
}

export function countNode(count) {
  return element('span', 'metric__meta', `${formatCount(count)} ${pluralRatings(count)}`);
}

/**
 * Пометка недостаточной выборки (D-25). Несёт полуширину интервала, а не
 * только факт: «мало» без величины не подсказывает, насколько не доверять числу.
 */
export function sufficiencyNode(ratings) {
  const sample = sampleSufficiency(ratings);
  if (sample.n === 0 || sample.sufficient) return null;

  const detail =
    sample.halfWidth === null
      ? 'интервал не определён'
      : `±${formatVoc(sample.halfWidth)} к VOC`;
  return element('span', 'metric__warning', `Мало оценок: ${detail}`);
}

/* Согласование числительного: «1 оценка», «2 оценки», «5 оценок» */
function pluralRatings(count) {
  const tail = Math.abs(count) % 100;
  if (tail >= 11 && tail <= 14) return 'оценок';
  switch (tail % 10) {
    case 1:
      return 'оценка';
    case 2:
    case 3:
    case 4:
      return 'оценки';
    default:
      return 'оценок';
  }
}
