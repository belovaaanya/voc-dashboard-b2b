/**
 * Positive control для каждого инварианта слайса.
 *
 * Зелёный тест ничего не доказывает, пока не падал на заведомо ломаном случае,
 * поэтому каждый тест здесь проверяет инвариант дважды: настоящая реализация
 * обязана пройти, нарочно сломанная — покраснеть. Если ломаная проходит,
 * инвариант беззубый, и это дефект теста, а не реализации.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { voc, ratingCount, LOW_MARK_MAX } from '../site/js/metrics.js';
import { breakdown, UNLABELLED } from '../site/js/breakdown.js';
import { decomposeVocChange } from '../site/js/impact.js';
import { sampleSufficiency } from '../site/js/sufficiency.js';
import { roundVoc } from '../site/js/round.js';
import { previousPeriod, resolvePreset } from '../site/js/period.js';
import { rating, ratingsWithMarks } from './helpers/ratings.js';
import {
  assertAveragesRatings,
  assertTimeSymmetric,
  assertContributionsSumToDelta,
  assertEffectsSumToContribution,
  assertDisplayDigits,
  assertMentionsAreUniqueRatings,
  assertNeutralElementHasNoImpact,
  assertNoNaN,
  assertPartialPeriodAligns,
  assertReconcilesToSliceVoc,
  assertWeightSumsToRatingCount,
} from './helpers/invariants.js';

const byOperations = (r) => r.operations;
const byProblem = (r) => [r.problem];
const on = (mark, operations) => rating({ mark, operations });

const unequalDays = () => [
  ...ratingsWithMarks([5, 5, 5], { appeal_date: '2026-05-01' }),
  ...ratingsWithMarks([1], { appeal_date: '2026-05-02' }),
];

// --- заведомо ломаные реализации ---------------------------------------------

/** `D-07` наоборот: усредняет дневные VOC. */
function vocOfDailyAverages(slice) {
  const days = [...new Set(slice.map(({ appeal_date }) => appeal_date))];
  return (
    days.reduce((sum, day) => sum + voc(slice.filter((r) => r.appeal_date === day)), 0) /
    days.length
  );
}

/** `D-08`, `D-09` наоборот: целое отнесение и счёт по вхождениям, без дедупликации. */
function naiveBreakdown(slice, project) {
  const groups = new Map();

  for (const item of slice) {
    for (const key of project(item)) {
      const group = groups.get(key) ?? { key, mentions: 0, markSum: 0, lowCount: 0 };
      group.mentions += 1;
      group.markSum += item.mark;
      if (item.mark <= LOW_MARK_MAX) group.lowCount += 1;
      groups.set(key, group);
    }
  }

  return [...groups.values()].map(({ markSum, ...group }) => ({
    ...group,
    weightedCount: group.mentions,
    voc: markSum / group.mentions,
    weightedVoc: markSum / group.mentions,
  }));
}

/** `D-11` наоборот: оценки без разметки выбрасываются из разреза. */
function breakdownDroppingUnlabelled(slice, project) {
  return breakdown(
    slice.filter((item) => project(item).every((key) => key !== null && String(key).trim() !== '')),
    project,
  );
}

/** `D-10` наоборот: эффект структуры выброшен. */
function impactWithMarkEffectOnly(previous, current, project) {
  const decomposition = decomposeVocChange(previous, current, project);
  return {
    ...decomposition,
    contributions: decomposition.contributions.map((item) => ({
      ...item,
      impact: item.markEffect,
    })),
  };
}

/** `D-10` наоборот: эффект структуры без отсчёта от среднего VOC периодов. */
function impactWithoutCenter(previous, current, project) {
  const decomposition = decomposeVocChange(previous, current, project);
  return {
    ...decomposition,
    contributions: decomposition.contributions.map((item) => {
      const mixEffect = item.mixEffect + (item.currentShare - item.previousShare) * center(decomposition);
      return { ...item, mixEffect, impact: item.markEffect + mixEffect };
    }),
  };
}

function center({ previousVoc, currentVoc }) {
  return (previousVoc + currentVoc) / 2;
}

/** `D-10` наоборот: эффект структуры отсчитывается от VOC прошлого периода, а не от середины. */
function impactAgainstPreviousVoc(previous, current, project) {
  const decomposition = decomposeVocChange(previous, current, project);
  const shift = center(decomposition) - decomposition.previousVoc;

  return {
    ...decomposition,
    contributions: decomposition.contributions.map((item) => {
      const mixEffect = item.mixEffect + (item.currentShare - item.previousShare) * shift;
      return { ...item, mixEffect, impact: item.markEffect + mixEffect };
    }),
  };
}

/** `D-25` наоборот: без защиты от выборки из одной оценки. */
function sufficiencyWithoutSmallSampleGuard(ratings) {
  const n = ratings.length;
  const mean = voc(ratings);
  const variance = ratings.reduce((sum, { mark }) => sum + (mark - mean) ** 2, 0) / (n - 1);
  const halfWidth = (1.96 * Math.sqrt(variance)) / Math.sqrt(n);

  return { n, mean, halfWidth, low: mean - halfWidth, high: mean + halfWidth };
}

/** `D-23`, `D-24` наоборот: скользящие 30 дней вместо календарного периода. */
function previousPeriodRolling30() {
  return { from: '2026-04-10', to: '2026-05-09' };
}

/** `D-21` наоборот: на вывод уходит больше знаков, чем решено. */
function roundVocWithThreeDigits(value) {
  return Number(value.toFixed(3));
}

// --- проверки инвариантов с двух сторон ---------------------------------------

test('positive control D-07: инвариант ловит усреднение средних', () => {
  const slice = unequalDays();

  assertAveragesRatings(voc, slice);
  assert.throws(
    () => assertAveragesRatings(vocOfDailyAverages, slice),
    /не равен среднему по оценкам/,
  );
});

test('positive control D-07: набор без разницы в числе оценок по дням инвариант не проверяет', () => {
  const flat = ratingsWithMarks([5, 1], { appeal_date: '2026-05-01' });

  assert.throws(
    () => assertAveragesRatings(voc, flat),
    /Набор не годится/,
    'инвариант обязан отказаться от набора, на котором оба способа совпадают',
  );
});

test('positive control D-08: инвариант ловит целое отнесение вместо веса 1/N', () => {
  const slice = [
    on(1, ['Выписка', 'Платежи']),
    on(5, ['Платежи']),
    on(3, ['Выписка']),
  ];

  assertWeightSumsToRatingCount(breakdown(slice, byOperations), slice);
  assert.throws(
    () => assertWeightSumsToRatingCount(naiveBreakdown(slice, byOperations), slice),
    /не равна числу оценок/,
  );
});

test('positive control D-08: инвариант ловит разрез, не сводящийся к VOC среза', () => {
  const slice = [
    on(1, ['Выписка', 'Платежи']),
    on(5, ['Платежи']),
    on(3, ['Выписка']),
  ];

  assertReconcilesToSliceVoc(breakdown(slice, byOperations), slice);
  assert.throws(
    () => assertReconcilesToSliceVoc(naiveBreakdown(slice, byOperations), slice),
    /не сходится с VOC среза/,
  );
});

test('positive control D-09: инвариант ловит потерянную дедупликацию по voc_ccode', () => {
  const products = {
    'Экспорт выписки': 'Выписка',
    'Печать выписки': 'Выписка',
    'Запрос выписки': 'Выписка',
  };
  const byProduct = (r) => r.operations.map((operation) => products[operation]);
  const slice = [
    on(1, ['Экспорт выписки', 'Печать выписки']),
    on(5, ['Запрос выписки']),
  ];

  assertMentionsAreUniqueRatings(breakdown(slice, byProduct), slice, byProduct);
  assert.throws(
    () => assertMentionsAreUniqueRatings(naiveBreakdown(slice, byProduct), slice, byProduct),
    /упоминаний 3, уникальных оценок 2/,
  );
});

test('positive control D-11: инвариант ловит выброшенные оценки без разметки', () => {
  const slice = [
    rating({ mark: 2, problem: 'Сбой при экспорте выписки' }),
    rating({ mark: 5, problem: null }),
    rating({ mark: 4, problem: '' }),
  ];

  assertReconcilesToSliceVoc(breakdown(slice, byProblem), slice);
  assert.equal(
    breakdownDroppingUnlabelled(slice, byProblem).some(({ key }) => key === UNLABELLED),
    false,
  );
  assert.throws(
    () => assertReconcilesToSliceVoc(breakdownDroppingUnlabelled(slice, byProblem), slice),
    /не сходится с VOC среза/,
  );
});

test('positive control D-10: главный инвариант ловит выброшенный эффект структуры', () => {
  // Структура обязана меняться несимметрично: на симметричном наборе эффекты
  // структуры сокращаются между собой, и выброшенное слагаемое не видно в сумме.
  const previous = [on(5, ['Выписка']), on(4, ['Платежи']), on(2, ['Лояльность'])];
  const current = [
    on(4, ['Выписка']),
    on(4, ['Платежи']),
    on(1, ['Лояльность']),
    on(1, ['Лояльность']),
  ];

  assertContributionsSumToDelta(decomposeVocChange(previous, current, byOperations));
  assert.throws(
    () => assertContributionsSumToDelta(impactWithMarkEffectOnly(previous, current, byOperations)),
    /не равна ΔVOC/,
  );
});

test('positive control D-10: сумма вкладов не ловит потерянный отсчёт от среднего, а отдельный инвариант ловит', () => {
  const previous = [on(4, ['Нейтраль']), on(3, ['Плохой']), on(5, ['Хороший'])];
  const current = [
    on(4, ['Нейтраль']),
    on(4, ['Нейтраль']),
    on(4, ['Нейтраль']),
    on(3, ['Плохой']),
    on(5, ['Хороший']),
  ];
  const broken = impactWithoutCenter(previous, current, byOperations);

  assert.equal(voc(previous), 4);
  assert.equal(voc(current), 4);

  assertContributionsSumToDelta(decomposeVocChange(previous, current, byOperations));
  assertNeutralElementHasNoImpact(
    decomposeVocChange(previous, current, byOperations),
    'Нейтраль',
  );

  assertContributionsSumToDelta(broken);
  assert.throws(
    () => assertNeutralElementHasNoImpact(broken, 'Нейтраль'),
    /у элемента среднего уровня/,
    'сломанная методика сходится в сумме — поймать её может только отдельный инвариант',
  );
});

test('positive control D-25: инвариант ловит деление на ноль на выборке из одной оценки', () => {
  const single = ratingsWithMarks([4]);

  assertNoNaN(sampleSufficiency(single), 'sufficiency');
  assert.throws(
    () => assertNoNaN(sufficiencyWithoutSmallSampleGuard(single), 'sufficiency'),
    /sufficiency\.(halfWidth|low|high) = (NaN|Infinity|-Infinity)/,
  );
});

test('positive control D-24: инвариант ловит скользящий период вместо календарного', () => {
  const period = resolvePreset('month', '2026-05-10');

  assertPartialPeriodAligns(previousPeriod, period, '2026-04-01');
  assert.throws(
    () => assertPartialPeriodAligns(previousPeriodRolling30, period, '2026-04-01'),
    /Предыдущий период начался 2026-04-10/,
  );
});

test('positive control D-21: инвариант ловит лишние знаки на выводе', () => {
  assertDisplayDigits(roundVoc, 2);
  assert.throws(() => assertDisplayDigits(roundVocWithThreeDigits, 2), /знаков 3/);
});

test('positive control: ratingCount не подменяется числом упоминаний', () => {
  const slice = [on(1, ['Выписка', 'Платежи']), on(5, ['Платежи'])];
  const mentions = naiveBreakdown(slice, byOperations).reduce(
    (sum, group) => sum + group.mentions,
    0,
  );

  assert.equal(ratingCount(slice), 2);
  assert.equal(mentions, 3);
});

test('positive control D-10: точка отсчёта закреплена числами, посчитанными руками', () => {
  const previous = [on(5, ['Выписка']), on(3, ['Платежи'])];
  const current = [on(5, ['Выписка']), on(5, ['Выписка']), on(1, ['Платежи'])];

  const { delta, contributions } = decomposeVocChange(previous, current, byOperations);
  const impactOf = (key) => contributions.find((item) => item.key === key).impact;

  assert.ok(Math.abs(delta + 1 / 3) < 1e-12, `ΔVOC ${delta}`);
  assert.ok(Math.abs(impactOf('Выписка') - 7 / 36) < 1e-12, `Выписка ${impactOf('Выписка')}`);
  assert.ok(Math.abs(impactOf('Платежи') + 19 / 36) < 1e-12, `Платежи ${impactOf('Платежи')}`);

  const broken = impactAgainstPreviousVoc(previous, current, byOperations);
  const brokenStatements = broken.contributions.find(({ key }) => key === 'Выписка').impact;

  assertContributionsSumToDelta(broken);
  assert.ok(
    Math.abs(brokenStatements - 1 / 6) < 1e-12,
    'односторонний отсчёт даёт 1/6 вместо 7/36 и всё равно сходится в сумме',
  );
});

test('positive control D-10: инвариант антисимметрии ловит одностороннюю точку отсчёта', () => {
  const previous = [on(5, ['Выписка']), on(3, ['Платежи'])];
  const current = [on(5, ['Выписка']), on(5, ['Выписка']), on(1, ['Платежи'])];

  assertTimeSymmetric(decomposeVocChange, previous, current, byOperations);
  assert.throws(
    () => assertTimeSymmetric(impactAgainstPreviousVoc, previous, current, byOperations),
    /при обратном сравнении/,
  );
});

test('positive control D-10: инвариант слагаемых ловит вклад, не равный своим эффектам', () => {
  const previous = [on(5, ['Выписка']), on(4, ['Платежи']), on(2, ['Лояльность'])];
  const current = [on(4, ['Выписка']), on(1, ['Лояльность']), on(1, ['Лояльность'])];

  assertEffectsSumToContribution(decomposeVocChange(previous, current, byOperations));
  assert.throws(
    () => assertEffectsSumToContribution(impactWithMarkEffectOnly(previous, current, byOperations)),
    /не даёт вклад/,
  );
});
