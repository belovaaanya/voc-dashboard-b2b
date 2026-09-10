import { test } from 'node:test';
import assert from 'node:assert/strict';

import { breakdown, UNLABELLED } from '../site/js/breakdown.js';
import { voc, ratingCount } from '../site/js/metrics.js';
import { rating } from './helpers/ratings.js';
import { assertReconcilesToSliceVoc } from './helpers/invariants.js';

const byOperations = (r) => r.operations;
const byProblem = (r) => [r.problem];

/** Справочник триггер → продукт из `data-model` §3.2, сведённый к одному каналу. */
const PRODUCT_OF = {
  'Экспорт выписки': 'Выписка',
  'Печать выписки': 'Выписка',
  'Запрос выписки': 'Выписка',
  'Отправка платежа': 'Платежи',
};
const byProduct = (r) => r.operations.map((operation) => PRODUCT_OF[operation]);

test('AC-9 breakdown SHOULD split a multi-trigger rating with weight 1/N so groups sum to the rating count', () => {
  const slice = [
    rating({ mark: 1, operations: ['Экспорт выписки', 'Отправка платежа'] }),
    rating({ mark: 5, operations: ['Отправка платежа'] }),
    rating({ mark: 3, operations: ['Экспорт выписки'] }),
  ];

  const groups = breakdown(slice, byOperations);
  const weighted = groups.reduce((sum, group) => sum + group.weightedCount, 0);
  const shares = groups.reduce((sum, group) => sum + group.share, 0);

  assert.deepEqual(
    Object.fromEntries(groups.map(({ key, weightedCount }) => [key, weightedCount])),
    { 'Экспорт выписки': 1.5, 'Отправка платежа': 1.5 },
  );
  assert.ok(Math.abs(weighted - ratingCount(slice)) < 1e-12, `сумма веса ${weighted}`);
  assert.ok(Math.abs(shares - 100) < 1e-12, `сумма долей ${shares}`);
});

test('AC-10 breakdown mentions SHOULD exceed the rating count on multi-trigger data', () => {
  const slice = [
    rating({ mark: 1, operations: ['Экспорт выписки', 'Отправка платежа'] }),
    rating({ mark: 5, operations: ['Отправка платежа'] }),
    rating({ mark: 3, operations: ['Экспорт выписки'] }),
  ];

  const mentions = breakdown(slice, byOperations).reduce(
    (sum, group) => sum + group.mentions,
    0,
  );

  assert.equal(mentions, 4);
  assert.ok(mentions > ratingCount(slice));
});

test('AC-10 breakdown mentions SHOULD equal the rating count on single-trigger data', () => {
  const slice = [
    rating({ mark: 1, operations: ['Экспорт выписки'] }),
    rating({ mark: 5, operations: ['Отправка платежа'] }),
  ];

  const mentions = breakdown(slice, byOperations).reduce(
    (sum, group) => sum + group.mentions,
    0,
  );

  assert.equal(mentions, ratingCount(slice));
});

test('AC-11 breakdown WHEN two triggers of one rating collapse into one group SHOULD count the rating once', () => {
  const slice = [
    rating({ mark: 1, operations: ['Экспорт выписки', 'Печать выписки'] }),
    rating({ mark: 5, operations: ['Запрос выписки'] }),
  ];

  const [statements] = breakdown(slice, byProduct);

  assert.equal(statements.key, 'Выписка');
  assert.equal(statements.mentions, 2, 'две оценки, а не три упоминания триггеров');
  assert.equal(statements.voc, 3, 'среднее по уникальным оценкам: (1 + 5) / 2');
  assert.equal(statements.weightedCount, 2);

  const withoutDeduplication = [1, 1, 5];
  assert.notEqual(
    statements.voc,
    withoutDeduplication.reduce((sum, mark) => sum + mark, 0) / withoutDeduplication.length,
    'без дедупликации получилось бы 2.33 — оценка учтена дважды',
  );
});

test('AC-16 breakdown WHEN problem is empty SHOULD keep the rating in an explicit unlabelled group', () => {
  const slice = [
    rating({ mark: 2, problem: 'Сбой при экспорте выписки' }),
    rating({ mark: 5, problem: null }),
    rating({ mark: 4, problem: '' }),
  ];

  const groups = breakdown(slice, byProblem);
  const unlabelled = groups.find(({ key }) => key === UNLABELLED);

  assert.equal(unlabelled.mentions, 2);
  assert.equal(unlabelled.voc, 4.5);
  assert.equal(
    groups.reduce((sum, group) => sum + group.mentions, 0),
    ratingCount(slice),
  );
});

test('AC-16 breakdown WITH the unlabelled group SHOULD reconcile to the slice VOC', () => {
  const slice = [
    rating({ mark: 2, problem: 'Сбой при экспорте выписки' }),
    rating({ mark: 5, problem: null }),
    rating({ mark: 4, problem: '' }),
  ];

  assertReconcilesToSliceVoc(breakdown(slice, byProblem), slice);
});

test('AC-16 breakdown SHOULD reconcile to the slice VOC on a multi-trigger cut too', () => {
  const slice = [
    rating({ mark: 1, operations: ['Экспорт выписки', 'Отправка платежа'] }),
    rating({ mark: 5, operations: ['Отправка платежа'] }),
    rating({ mark: 3, operations: ['Экспорт выписки', 'Печать выписки', 'Запрос выписки'] }),
  ];

  assertReconcilesToSliceVoc(breakdown(slice, byOperations), slice);
});

test('AC-17 breakdown WHEN the unlabelled group is dropped SHOULD stop reconciling to the slice VOC', () => {
  const slice = [
    rating({ mark: 2, problem: 'Сбой при экспорте выписки' }),
    rating({ mark: 5, problem: null }),
    rating({ mark: 4, problem: '' }),
  ];

  const withoutUnlabelled = breakdown(slice, byProblem).filter(
    ({ key }) => key !== UNLABELLED,
  );

  assert.throws(
    () => assertReconcilesToSliceVoc(withoutUnlabelled, slice),
    /VOC разреза/,
    'выброшенная группа «Без разметки» обязана ломать инвариант',
  );
  assert.equal(voc(slice), 11 / 3);
  assert.equal(withoutUnlabelled[0].weightedVoc, 2);
});

test('AC-16 breakdown WHEN the projection returns nothing SHOULD keep the rating instead of losing it', () => {
  const slice = [
    rating({ mark: 2, operations: ['Экспорт выписки'] }),
    rating({ mark: 4, operations: [] }),
  ];

  const groups = breakdown(slice, byOperations);

  assert.deepEqual(
    groups.map(({ key, weightedCount }) => [key, weightedCount]),
    [['Без разметки', 1], ['Экспорт выписки', 1]],
  );
  assertReconcilesToSliceVoc(groups, slice);
});

test('breakdown SHOULD order groups by weight, then by key, so rendering is stable', () => {
  const slice = [
    rating({ mark: 5, operations: ['Отправка платежа'] }),
    rating({ mark: 5, operations: ['Экспорт выписки'] }),
    rating({ mark: 5, operations: ['Запрос выписки'] }),
    rating({ mark: 5, operations: ['Запрос выписки'] }),
  ];

  assert.deepEqual(
    breakdown(slice, byOperations).map(({ key }) => key),
    ['Запрос выписки', 'Отправка платежа', 'Экспорт выписки'],
  );
});
