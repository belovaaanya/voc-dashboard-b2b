/**
 * Достаточность выборки через точность оценки среднего (`D-25`).
 *
 * Порог выражен не магическим `n`, а полушириной 95 % доверительного интервала
 * VOC: «оценок мало» означает «интервал шире, чем нам не всё равно».
 */

import { voc } from './metrics.js';

/**
 * ЗАГЛУШКА до подписи аналитики (`D-25`): `0.1` балла выбрано как порядок
 * величины, а не как обоснованный порог. Число живёт здесь одно, потому что
 * подписанное значение обязано заменяться правкой одной строки.
 */
export const DEFAULT_PRECISION_THRESHOLD = 0.1;

/**
 * Квантили Стьюдента (двусторонние 95 %) по числу степеней свободы. `sd`
 * выборочное, поэтому нормальный квантиль занижал бы интервал именно там, где
 * правило и нужно: при `n = 2` в 6.5 раза.
 */
const T_95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
  2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
];
const Z_95 = 1.96;

/**
 * `minimumRatings` выключен по умолчанию: требования прямо запрещают выбирать
 * порог произвольно, а нулевая наблюдаемая дисперсия на крошечной выборке даёт
 * `halfWidth = 0` и тем самым объявляет её достаточной. Это известная слабость
 * правила через CI, и закрывает её только подписанное аналитикой число.
 */
export function sampleSufficiency(
  ratings,
  threshold = DEFAULT_PRECISION_THRESHOLD,
  minimumRatings = null,
) {
  const n = ratings.length;
  const mean = voc(ratings);
  const tooFew = minimumRatings !== null && n < minimumRatings;

  if (n < 2) {
    return {
      n, mean, halfWidth: null, low: null, high: null,
      threshold, minimumRatings, sufficient: false,
    };
  }

  const variance =
    ratings.reduce((sum, { mark }) => sum + (mark - mean) ** 2, 0) / (n - 1);
  const halfWidth = (quantile(n - 1) * Math.sqrt(variance)) / Math.sqrt(n);

  return {
    n,
    mean,
    halfWidth,
    low: mean - halfWidth,
    high: mean + halfWidth,
    threshold,
    minimumRatings,
    sufficient: halfWidth <= threshold && !tooFew,
  };
}

function quantile(degreesOfFreedom) {
  return T_95[degreesOfFreedom - 1] ?? Z_95;
}
