import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConclusion } from '../site/js/conclusions.js';
import { rating } from './helpers/ratings.js';

const byOperations = (row) => row.operations;
const on = (date, mark, operation) => rating({ appeal_date: date, mark, operations: [operation] });

test('SUM-1 conclusion SHOULD keep strongest positive and negative factors from one decomposition (V-16)', () => {
  const previous = [on('2026-04-01', 5, 'А'), on('2026-04-01', 3, 'Б')];
  const current = [on('2026-05-01', 4, 'А'), on('2026-05-01', 4, 'Б')];
  const result = buildConclusion(previous, current, byOperations);

  assert.deepEqual(result.positive.map(({ key }) => key), ['Б']);
  assert.deepEqual(result.negative.map(({ key }) => key), ['А']);
  assert.ok(result.positive.every(({ impact }) => impact > 0));
  assert.ok(result.negative.every(({ impact }) => impact < 0));
});

test('SUM-2 conclusion SHOULD limit and sort both directions by absolute influence', () => {
  const previous = [on('2026-04-01', 3, 'А'), on('2026-04-01', 3, 'Б'), on('2026-04-01', 3, 'В')];
  const current = [on('2026-05-01', 5, 'А'), on('2026-05-01', 4, 'Б'), on('2026-05-01', 1, 'В')];
  const result = buildConclusion(previous, current, byOperations, 1);

  assert.equal(result.positive.length, 1);
  assert.equal(result.negative.length, 1);
  assert.equal(result.positive[0].key, 'А');
  assert.equal(result.negative[0].key, 'В');
});

test('SUM-3 conclusion SHOULD not invent factors without a comparison', () => {
  const result = buildConclusion([], [on('2026-05-01', 5, 'А')], byOperations);

  assert.equal(result.delta, null);
  assert.deepEqual(result.positive, []);
  assert.deepEqual(result.negative, []);
});
