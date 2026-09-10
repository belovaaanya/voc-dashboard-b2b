/**
 * Вклад антидрайвера: разложение изменения общего VOC по элементам разреза (`D-10`).
 *
 * **Методика требует подписи аналитики.** Она даёт проверяемый результат, но
 * «правильной» её делает аналитика, а не тест. Поэтому вся формула живёт здесь
 * и только здесь: замена методики — правка одного файла, а не поиск слагаемых
 * по дашборду.
 *
 * ## Что считается
 *
 * VOC периода раскладывается по элементам разреза как `Σ share × level`, где
 * `share` — доля оценок элемента (дробное отнесение `D-08`), `level` — VOC
 * элемента с тем же весом. Тождество точное, поэтому изменение VOC между
 * периодами распадается на два слагаемых на каждый элемент:
 *
 * - **эффект оценки** — элемент стали оценивать иначе: `Δlevel × средняя доля`;
 * - **эффект структуры** — элемент стали упоминать чаще или реже:
 *   `Δdoля × (средний level элемента − средний VOC периодов)`.
 *
 * Отсчёт эффекта структуры от среднего VOC обязателен для смысла, а не для
 * сходимости: без него элемент со средним уровнем «вносит» изменение просто
 * потому, что вырос его вес. Сумма при этом не меняется — доли обоих периодов
 * дают единицу, поэтому вычитаемая константа сокращается.
 *
 * **Инвариант:** сумма вкладов равна фактическому `ΔVOC`. Он и проверяет
 * методику: произвольная формула его не проходит
 * (`test/negative-controls.test.js`).
 *
 * Знак вклада читается как в макете: отрицательный тянул VOC вниз (`V-15`).
 * Элемент, которого в одном из периодов не было, меняет только структуру.
 */

import { breakdown } from './breakdown.js';
import { voc } from './metrics.js';

export function decomposeVocChange(previous, current, project) {
  const previousVoc = voc(previous);
  const currentVoc = voc(current);

  if (previousVoc === null || currentVoc === null) {
    return { previousVoc, currentVoc, delta: null, contributions: [] };
  }

  const before = index(breakdown(previous, project));
  const after = index(breakdown(current, project));
  const center = (previousVoc + currentVoc) / 2;

  const contributions = [...new Set([...before.keys(), ...after.keys()])]
    .map((key) => contribution(key, before.get(key), after.get(key), {
      previousSize: previous.length,
      currentSize: current.length,
      center,
    }))
    .sort((left, right) => left.impact - right.impact);

  return {
    previousVoc,
    currentVoc,
    delta: currentVoc - previousVoc,
    contributions,
  };
}

function contribution(key, before, after, { previousSize, currentSize, center }) {
  const previousShare = before ? before.weightedCount / previousSize : 0;
  const currentShare = after ? after.weightedCount / currentSize : 0;
  const previousLevel = before ? before.weightedVoc : after.weightedVoc;
  const currentLevel = after ? after.weightedVoc : before.weightedVoc;

  const markEffect = (currentLevel - previousLevel) * ((previousShare + currentShare) / 2);
  const mixEffect =
    (currentShare - previousShare) * ((previousLevel + currentLevel) / 2 - center);

  return {
    key,
    impact: markEffect + mixEffect,
    markEffect,
    mixEffect,
    previousShare,
    currentShare,
    previousLevel: before ? before.weightedVoc : null,
    currentLevel: after ? after.weightedVoc : null,
  };
}

function index(groups) {
  return new Map(groups.map((group) => [group.key, group]));
}
