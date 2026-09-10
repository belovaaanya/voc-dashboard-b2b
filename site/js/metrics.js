/**
 * Базовые агрегации по оценкам (`D-07`, `D-15`) — методика в `docs/calc-core.md` §3.
 *
 * Неопределённое на срезе значение — `null`, а не `0`: ноль это ответ, а не его
 * отсутствие. Числа полной точности, округление на выводе (`D-21`).
 */

import { roundDelta } from './round.js';

export const MARKS = [1, 2, 3, 4, 5];

/** `docs/data-model.md` §4. */
export const LOW_MARK_MAX = 2;

export function voc(ratings) {
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, { mark }) => sum + mark, 0) / ratings.length;
}

export function ratingCount(ratings) {
  return ratings.length;
}

export function lowRatingCount(ratings) {
  return ratings.filter(({ mark }) => mark <= LOW_MARK_MAX).length;
}

export function markDistribution(ratings) {
  const total = ratings.length;

  return MARKS.map((mark) => {
    const count = ratings.filter((rating) => rating.mark === mark).length;
    return { mark, count, share: total === 0 ? null : (count * 100) / total };
  });
}

/**
 * Изменение VOC к предыдущему периоду. Пустой любой из двух срезов — `null`,
 * а не `0`: «сравнивать не с чем» и «не изменилось» — разные ответы.
 */
export function vocDelta(ratings, previousRatings) {
  const current = voc(ratings);
  const previous = voc(previousRatings);
  if (current === null || previous === null) return null;
  return current - previous;
}

/**
 * Направление тренда выводится из знака дельты, а не задаётся отдельно
 * (`V-15`). Сравнивается **округлённая** дельта: иначе `+0,004` покажет
 * стрелку роста рядом с подписью `+0,00` и интерфейс возразит сам себе
 * (тот же принцип, что в `D-22`).
 */
export function trendOf(delta) {
  const shown = roundDelta(delta);
  if (shown === null) return null;
  if (shown > 0) return 'up';
  return shown < 0 ? 'down' : 'flat';
}

export function groupBy(ratings, select) {
  const groups = new Map();

  for (const rating of ratings) {
    const key = select(rating);
    const group = groups.get(key);
    if (group) group.push(rating);
    else groups.set(key, [rating]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => compareKeys(left, right))
    .map(([key, grouped]) => ({ key, ratings: grouped }));
}

export function summarize(ratings) {
  const total = ratings.length;
  const fives = ratings.filter(({ mark }) => mark === 5).length;

  return {
    voc: voc(ratings),
    count: total,
    lowCount: lowRatingCount(ratings),
    share5: total === 0 ? null : (fives * 100) / total,
  };
}

/** Порядок групп для вывода: `ru`, иначе `Ё` встанет перед `А`, а строчные — после всех прописных. */
export function compareKeys(left, right) {
  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right, 'ru');
  }
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
