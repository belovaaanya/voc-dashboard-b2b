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

/** Нормальное приближение, двусторонние 95 %. */
const Z_95 = 1.96;

export function sampleSufficiency(ratings, threshold = DEFAULT_PRECISION_THRESHOLD) {
  const n = ratings.length;
  const mean = voc(ratings);

  if (n < 2) {
    return { n, mean, halfWidth: null, low: null, high: null, threshold, sufficient: false };
  }

  const variance =
    ratings.reduce((sum, { mark }) => sum + (mark - mean) ** 2, 0) / (n - 1);
  const halfWidth = (Z_95 * Math.sqrt(variance)) / Math.sqrt(n);

  return {
    n,
    mean,
    halfWidth,
    low: mean - halfWidth,
    high: mean + halfWidth,
    threshold,
    sufficient: halfWidth <= threshold,
  };
}
