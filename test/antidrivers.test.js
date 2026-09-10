import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildHeatmap, heatTone, rankAntidrivers } from '../site/js/antidrivers.js';
import { formatImpact } from '../site/js/format.js';
import { rating } from './helpers/ratings.js';

const byOperations = (row) => row.operations;
const on = (appealDate, mark, operations) => rating({ appeal_date: appealDate, mark, operations });

test('ANTI-1 ranking SHOULD contain only negative contributions when antidrivers exist', () => {
  const previous = [on('2026-04-01', 5, ['Выписка']), on('2026-04-01', 5, ['Платежи'])];
  const current = [on('2026-05-01', 1, ['Выписка']), on('2026-05-01', 5, ['Платежи'])];

  const ranking = rankAntidrivers(previous, current, byOperations);

  assert.equal(ranking.hasAntidrivers, true);
  assert.deepEqual(ranking.items.map(({ key }) => key), ['Выписка']);
  assert.ok(ranking.items.every(({ impact }) => impact < 0));
});

test('ANTI-1 ranking SHOULD name the no-antidriver case without relabelling positive impact', () => {
  const previous = [on('2026-04-01', 4, ['Выписка']), on('2026-04-01', 4, ['Платежи'])];
  const current = [on('2026-05-01', 5, ['Выписка']), on('2026-05-01', 5, ['Платежи'])];

  const ranking = rankAntidrivers(previous, current, byOperations);

  assert.equal(ranking.hasAntidrivers, false);
  assert.equal(ranking.items.length, 2);
  assert.ok(ranking.items.every(({ impact }) => impact > 0));
});

test('ANTI-1 ranking SHOULD keep zero contributions out of the positive fallback', () => {
  const previous = [on('2026-04-01', 4, ['Выписка']), on('2026-04-01', 4, ['Платежи'])];
  const current = [on('2026-05-01', 4, ['Выписка']), on('2026-05-01', 4, ['Платежи'])];

  const ranking = rankAntidrivers(previous, current, byOperations);

  assert.equal(ranking.delta, 0);
  assert.equal(ranking.hasAntidrivers, false);
  assert.deepEqual(ranking.items, []);
});

test('ANTI-2 ranking SHOULD stay empty when either comparison period has no data', () => {
  const ranking = rankAntidrivers([], [on('2026-05-01', 2, ['Выписка'])], byOperations);

  assert.equal(ranking.delta, null);
  assert.deepEqual(ranking.items, []);
});

test('ANTI-3 heatmap SHOULD use unique ratings per key and keep empty intervals', () => {
  const rows = [
    on('2026-05-01', 5, ['Выписка', 'Платежи']),
    on('2026-05-01', 1, ['Выписка']),
    on('2026-05-03', 3, ['Платежи']),
  ];

  const heatmap = buildHeatmap(
    rows,
    { from: '2026-05-01', to: '2026-05-03' },
    'day',
    byOperations,
    ['Выписка', 'Платежи'],
  );

  assert.deepEqual(heatmap.columns.map(({ from, to }) => ({ from, to })), [
    { from: '2026-05-01', to: '2026-05-01' },
    { from: '2026-05-02', to: '2026-05-02' },
    { from: '2026-05-03', to: '2026-05-03' },
  ]);
  assert.deepEqual(heatmap.rows[0].cells.map(({ voc, mentions }) => ({ voc, mentions })), [
    { voc: 3, mentions: 2 },
    { voc: null, mentions: 0 },
    { voc: null, mentions: 0 },
  ]);
  assert.deepEqual(heatmap.rows[1].cells.map(({ voc, mentions }) => ({ voc, mentions })), [
    { voc: 5, mentions: 1 },
    { voc: null, mentions: 0 },
    { voc: 3, mentions: 1 },
  ]);
});

test('ANTI-4 heat tone SHOULD be monotonic and stable for an equal value', () => {
  const domain = { min: 3, max: 5 };

  assert.deepEqual([heatTone(3, domain), heatTone(4, domain), heatTone(5, domain)], ['bad', 'mid', 'good']);
  assert.equal(heatTone(4, domain), heatTone(4, domain));
  assert.equal(heatTone(null, domain), 'empty');
  assert.equal(heatTone(4, { min: 4, max: 4 }), 'mid');
});

test('ANTI-5 impact SHOULD keep an explicit sign outside color', () => {
  assert.equal(formatImpact(0.002), '+0,002');
  assert.equal(formatImpact(-0.002), '-0,002');
  assert.equal(formatImpact(0), '0,000');
});
