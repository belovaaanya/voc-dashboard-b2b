/**
 * Округление на выводе (`D-21`): считаем в полной точности, округляем здесь.
 *
 * Это только числа. Строки — запятая, неразрывный пробел, `ru-RU` — дело
 * функции форматирования (`D-20`), и смешивать их нельзя: округлённое число
 * ещё участвует в сравнениях (например, бейдж плана в `D-22`), а строка уже нет.
 */

const VOC_DIGITS = 2;
const DELTA_DIGITS = 2;
const IMPACT_DIGITS = 3;

export function roundVoc(value) {
  return round(value, VOC_DIGITS);
}

export function roundDelta(value) {
  return round(value, DELTA_DIGITS);
}

export function roundImpact(value) {
  return round(value, IMPACT_DIGITS);
}

/**
 * Доли распределения — целые проценты, сумма ровно `100` (requirements 3.7).
 * Поэлементное округление даёт `99` или `101`, поэтому недостающие проценты
 * раздаются по наибольшему остатку.
 */
export function roundShares(shares) {
  if (shares.some((share) => share === null || share === undefined)) {
    return shares.map(() => null);
  }

  const rounded = shares.map((share) => Math.floor(share));
  const spare = 100 - rounded.reduce((sum, share) => sum + share, 0);
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (const { index } of byRemainder.slice(0, Math.max(spare, 0))) {
    rounded[index] += 1;
  }

  return rounded;
}

function round(value, digits) {
  if (value === null || value === undefined) return null;

  // toFixed округляет по десятичному представлению, Math.round — по двоичному.
  const rounded = Number(value.toFixed(digits));
  return rounded === 0 ? 0 : rounded;
}
