/**
 * Инварианты слайса — отдельными проверками, параметризованными реализацией.
 *
 * Так один и тот же инвариант проверяется с двух сторон: на настоящей функции он
 * обязан проходить, на заведомо ломаной (`test/negative-controls.test.js`) —
 * падать. Инвариант, который никогда не падал, ничего не доказывает.
 */

import { voc } from '../../site/js/metrics.js';
import { dayCount } from '../../site/js/period.js';

const TOLERANCE = 1e-12;

/** `D-08`, `D-11`: VOC, пересчитанный по разрезу, обязан совпасть с VOC среза. */
export function assertReconcilesToSliceVoc(groups, slice, tolerance = TOLERANCE) {
  const weight = groups.reduce((sum, group) => sum + group.weightedCount, 0);
  const weighted = groups.reduce(
    (sum, group) => sum + group.weightedCount * group.weightedVoc,
    0,
  );
  const reconciled = weight === 0 ? null : weighted / weight;
  const expected = voc(slice);

  if (reconciled === null || Math.abs(reconciled - expected) > tolerance) {
    throw new Error(
      `VOC разреза ${reconciled} не сходится с VOC среза ${expected}`,
    );
  }
}

/** `D-08`: дробное отнесение сохраняет аддитивность разреза. */
export function assertWeightSumsToRatingCount(groups, slice, tolerance = TOLERANCE) {
  const weight = groups.reduce((sum, group) => sum + group.weightedCount, 0);
  const expected = slice.length;

  if (Math.abs(weight - expected) > tolerance) {
    throw new Error(`Сумма веса разреза ${weight} не равна числу оценок ${expected}`);
  }
}

/** `D-10`, главный инвариант слайса: сумма вкладов равна фактическому `ΔVOC`. */
export function assertContributionsSumToDelta(decomposition, tolerance = TOLERANCE) {
  const { delta, contributions } = decomposition;
  const total = contributions.reduce((sum, { impact }) => sum + impact, 0);

  if (Math.abs(total - delta) > tolerance) {
    throw new Error(`Сумма вкладов ${total} не равна ΔVOC ${delta}`);
  }
}

/** `D-10`: вклад элемента разложен на эффект оценки и эффект структуры без остатка. */
export function assertEffectsSumToContribution(decomposition, tolerance = TOLERANCE) {
  for (const { key, markEffect, mixEffect, impact } of decomposition.contributions) {
    if (Math.abs(markEffect + mixEffect - impact) > tolerance) {
      throw new Error(
        `${key}: ${markEffect} + ${mixEffect} не даёт вклад ${impact}`,
      );
    }
  }
}

/** `D-25`: полуширина CI — число либо `null`, но никогда `NaN`. */
export function assertNoNaN(value, label) {
  const values = typeof value === 'object' && value !== null ? Object.entries(value) : [[label, value]];

  for (const [key, item] of values) {
    if (typeof item === 'number' && !Number.isFinite(item)) {
      throw new Error(`${label}.${key} = ${item}`);
    }
  }
}

/** `D-07`: VOC обязан считаться по оценкам, а не как среднее дневных VOC. */
export function assertAveragesRatings(vocOf, slice, tolerance = TOLERANCE) {
  const days = [...new Set(slice.map(({ appeal_date }) => appeal_date))];
  const meanOfDays =
    days.reduce((sum, day) => sum + voc(slice.filter((r) => r.appeal_date === day)), 0) /
    days.length;
  const overRatings = voc(slice);

  if (Math.abs(overRatings - meanOfDays) <= tolerance) {
    throw new Error('Набор не годится для проверки: средние по оценкам и по дням совпали');
  }

  const actual = vocOf(slice);
  if (Math.abs(actual - overRatings) > tolerance) {
    throw new Error(`VOC ${actual} не равен среднему по оценкам ${overRatings}`);
  }
}

/**
 * `D-09`, `data-model` §5.2: упоминание — уникальная оценка в группе.
 * Ожидание считается по сырым ключам проекции, поэтому проекция не должна
 * возвращать пустых значений.
 */
export function assertMentionsAreUniqueRatings(groups, slice, project) {
  for (const { key, mentions } of groups) {
    const unique = new Set(
      slice.filter((r) => project(r).includes(key)).map(({ voc_ccode }) => voc_ccode),
    ).size;

    if (mentions !== unique) {
      throw new Error(`${key}: упоминаний ${mentions}, уникальных оценок ${unique}`);
    }
  }
}

/**
 * `D-10`: элемент, уровень которого равен общему VOC, не создаёт вклада только
 * потому, что вырос его вес. Сумма вкладов этого не ловит — константа отсчёта
 * в ней сокращается, поэтому инвариант нужен отдельный.
 */
export function assertNeutralElementHasNoImpact(decomposition, key, tolerance = 1e-9) {
  const neutral = decomposition.contributions.find((item) => item.key === key);

  if (!neutral) throw new Error(`В разложении нет элемента ${key}`);
  if (Math.abs(neutral.impact) > tolerance) {
    throw new Error(`${key}: вклад ${neutral.impact} у элемента среднего уровня`);
  }
}

/** `D-24`: неполный период сравнивается с началом предыдущего календарного. */
export function assertPartialPeriodAligns(previousOf, period, calendarStart) {
  const previous = previousOf(period);

  if (previous.from !== calendarStart) {
    throw new Error(`Предыдущий период начался ${previous.from}, а не ${calendarStart}`);
  }
  if (dayCount(previous) !== dayCount(period)) {
    throw new Error(
      `Длины сравниваемых диапазонов ${dayCount(previous)} и ${dayCount(period)}`,
    );
  }
}

/** `D-21`: на вывод уходит ровно столько знаков, сколько решено. */
export function assertDisplayDigits(roundOf, digits, sample = 1.23456789) {
  const rounded = roundOf(sample);
  const actual = String(rounded).split('.')[1]?.length ?? 0;

  if (actual > digits) {
    throw new Error(`${rounded}: знаков ${actual}, разрешено ${digits}`);
  }
}

/**
 * `D-10`: сравнение периодов обязано быть антисимметричным — «май к апрелю»
 * даёт ровно минус «апрель к маю». Инвариант держит именно точку отсчёта:
 * односторонняя (VOC любого из периодов) антисимметрию ломает, а сумма вкладов
 * этого не видит.
 */
export function assertTimeSymmetric(decomposeOf, previous, current, project, tolerance = 1e-12) {
  const forward = decomposeOf(previous, current, project);
  const backward = decomposeOf(current, previous, project);
  const mirrored = new Map(backward.contributions.map((item) => [item.key, item.impact]));

  for (const { key, impact } of forward.contributions) {
    const back = mirrored.get(key);

    if (Math.abs(impact + back) > tolerance) {
      throw new Error(`${key}: вклад ${impact} против ${back} при обратном сравнении`);
    }
  }
}
