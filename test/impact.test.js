import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decomposeVocChange } from '../site/js/impact.js';
import { voc } from '../site/js/metrics.js';
import { rating } from './helpers/ratings.js';
import {
  assertContributionsSumToDelta,
  assertEffectsSumToContribution,
} from './helpers/invariants.js';

const byOperations = (r) => r.operations;

const on = (mark, operations) => rating({ mark, operations });

test('AC-12 decomposeVocChange WHEN only marks change SHOULD put the whole delta into the mark effect', () => {
  const previous = [on(4, ['Выписка']), on(4, ['Платежи'])];
  const current = [on(2, ['Выписка']), on(4, ['Платежи'])];

  const decomposition = decomposeVocChange(previous, current, byOperations);
  const statements = decomposition.contributions.find(({ key }) => key === 'Выписка');

  assert.equal(decomposition.delta, -1);
  assert.equal(statements.markEffect, -1);
  assert.equal(Math.abs(statements.mixEffect), 0, 'структура не менялась');
  assertContributionsSumToDelta(decomposition);
});

test('AC-12 decomposeVocChange WHEN only the mix changes SHOULD put the whole delta into the mix effect', () => {
  const previous = [on(2, ['Выписка']), on(4, ['Платежи']), on(4, ['Платежи'])];
  const current = [on(2, ['Выписка']), on(2, ['Выписка']), on(4, ['Платежи'])];

  const decomposition = decomposeVocChange(previous, current, byOperations);

  assert.equal(decomposition.delta, voc(current) - voc(previous));
  for (const contribution of decomposition.contributions) {
    assert.equal(contribution.markEffect, 0, `${contribution.key}: оценки не менялись`);
  }
  assertContributionsSumToDelta(decomposition);
});

test('AC-12 decomposeVocChange WHEN marks and mix both change SHOULD still sum to the actual delta', () => {
  const previous = [
    on(5, ['Выписка']),
    on(4, ['Платежи', 'Выписка']),
    on(3, ['Лояльность']),
  ];
  const current = [
    on(2, ['Выписка']),
    on(5, ['Платежи']),
    on(4, ['Платежи', 'Лояльность']),
    on(1, ['Лояльность']),
  ];

  const decomposition = decomposeVocChange(previous, current, byOperations);

  assert.equal(decomposition.delta, voc(current) - voc(previous));
  assertContributionsSumToDelta(decomposition);
  assertEffectsSumToContribution(decomposition);
});

test('AC-13 decomposeVocChange SHOULD split every contribution into mark and mix effects', () => {
  const previous = [on(5, ['Выписка']), on(4, ['Платежи'])];
  const current = [on(3, ['Выписка']), on(4, ['Платежи']), on(4, ['Платежи'])];

  const decomposition = decomposeVocChange(previous, current, byOperations);

  assertEffectsSumToContribution(decomposition);
  for (const contribution of decomposition.contributions) {
    assert.equal(
      contribution.impact,
      contribution.markEffect + contribution.mixEffect,
    );
  }
});

test('AC-14 decomposeVocChange WHEN an element appears SHOULD attribute it to the mix effect and still sum', () => {
  const previous = [on(5, ['Выписка']), on(5, ['Выписка'])];
  const current = [on(5, ['Выписка']), on(1, ['Зарплатный проект'])];

  const decomposition = decomposeVocChange(previous, current, byOperations);
  const payroll = decomposition.contributions.find(
    ({ key }) => key === 'Зарплатный проект',
  );

  assert.equal(payroll.previousShare, 0);
  assert.equal(payroll.markEffect, 0, 'у элемента не было прошлой оценки — эффект чисто структурный');
  assertContributionsSumToDelta(decomposition);
  assertEffectsSumToContribution(decomposition);
});

test('AC-14 decomposeVocChange WHEN an element disappears SHOULD still sum to the actual delta', () => {
  const previous = [on(1, ['Зарплатный проект']), on(5, ['Выписка'])];
  const current = [on(5, ['Выписка']), on(4, ['Выписка'])];

  const decomposition = decomposeVocChange(previous, current, byOperations);
  const payroll = decomposition.contributions.find(
    ({ key }) => key === 'Зарплатный проект',
  );

  assert.equal(payroll.currentShare, 0);
  assert.ok(payroll.impact > 0, 'уход низких оценок тянет VOC вверх');
  assertContributionsSumToDelta(decomposition);
});

test('AC-12 decomposeVocChange SHOULD sum to the actual delta on multi-trigger data', () => {
  const previous = [
    on(5, ['Выписка', 'Платежи']),
    on(3, ['Выписка', 'Платежи', 'Лояльность']),
    on(4, ['Платежи']),
  ];
  const current = [
    on(1, ['Выписка', 'Платежи']),
    on(5, ['Лояльность']),
    on(4, ['Выписка']),
  ];

  const decomposition = decomposeVocChange(previous, current, byOperations);

  assertContributionsSumToDelta(decomposition);
  assertEffectsSumToContribution(decomposition);
});

test('decomposeVocChange SHOULD rank the strongest antidriver first', () => {
  const previous = [on(5, ['Выписка']), on(5, ['Платежи']), on(5, ['Лояльность'])];
  const current = [on(1, ['Выписка']), on(4, ['Платежи']), on(5, ['Лояльность'])];

  const decomposition = decomposeVocChange(previous, current, byOperations);

  assert.deepEqual(
    decomposition.contributions.map(({ key }) => key),
    ['Выписка', 'Платежи', 'Лояльность'],
  );
  assert.ok(decomposition.contributions[0].impact < 0);
});

test('decomposeVocChange SHOULD report both period VOC values it compared', () => {
  const previous = [on(4, ['Выписка'])];
  const current = [on(2, ['Выписка'])];

  const decomposition = decomposeVocChange(previous, current, byOperations);

  assert.equal(decomposition.previousVoc, 4);
  assert.equal(decomposition.currentVoc, 2);
  assert.equal(decomposition.delta, -2);
});
