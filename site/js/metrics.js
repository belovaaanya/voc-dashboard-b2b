/**
 * Базовые агрегации по оценкам (`D-07`).
 *
 * Грань факта — одна оценка (`docs/data-model.md` §2), поэтому любой показатель
 * среза считается по оценкам и никогда по уже посчитанным средним.
 *
 * Возвращаемые числа — полной точности, округление только на выводе (`D-21`).
 * Там, где значение на срезе не определено (пустой срез), возвращается `null`,
 * а не `0` и не `NaN`: `0` — это ответ, а не отсутствие ответа.
 */

export const MARKS = [1, 2, 3, 4, 5];

/** Низкая оценка — `MARK1_VALUE <= 2` (`docs/data-model.md` §4). */
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

function compareKeys(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
