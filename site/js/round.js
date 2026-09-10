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
const COUNT_DIGITS = 0;
const SHARE_DIGITS = 1;

export function roundVoc(value) {
  return round(value, VOC_DIGITS);
}

export function roundDelta(value) {
  return round(value, DELTA_DIGITS);
}

export function roundImpact(value) {
  return round(value, IMPACT_DIGITS);
}

export function roundCount(value) {
  return round(value, COUNT_DIGITS);
}

/** Доли — один знак (`D-40`), и дельта доли показывается с той же точностью. */
export function roundShare(value) {
  return round(value, SHARE_DIGITS);
}

/**
 * Доли распределения — целые проценты, сумма ровно `100` (requirements 3.7):
 * поэлементное округление даёт `99` или `101`, поэтому недостающее раздаётся
 * по наибольшему остатку. Входные доли обязаны давать `100` — иначе раздавать
 * нечего, и функция об этом сообщает.
 */
export function roundShares(shares) {
  if (shares.length === 0) return [];
  if (shares.some((share) => share === null || share === undefined)) {
    return shares.map(() => null);
  }

  const exact = shares.reduce((sum, share) => sum + share, 0);
  if (Math.abs(exact - 100) > 0.5) {
    throw new Error(`Доли не дают 100 и раздать нечего: ${exact}`);
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
  // round — последняя остановка перед DOM, поэтому NaN гасится здесь, а не на экране.
  if (value === null || value === undefined || !Number.isFinite(value)) return null;

  // toFixed не добавляет своего шага умножения на 10^n, в отличие от Math.round.
  const rounded = Number(value.toFixed(digits));
  return rounded === 0 ? 0 : rounded;
}
