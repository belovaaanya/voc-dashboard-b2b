import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildInsights, previousDateForFocus, sortInsights } from '../site/js/insights.js';
import { rating } from './helpers/ratings.js';

const previousPeriod = { from: '2026-04-01', to: '2026-04-02' };
const currentPeriod = { from: '2026-05-01', to: '2026-05-02' };
const project = (row) => [row.problem || 'Без разметки'];

const previous = [
  rating({ appeal_date: '2026-04-01', mark: 5, problem: 'Выписка' }),
  rating({ appeal_date: '2026-04-01', mark: 5, problem: 'Платежи' }),
  rating({ appeal_date: '2026-04-02', mark: 1, problem: 'Выписка' }),
  rating({ appeal_date: '2026-04-02', mark: 1, problem: 'Платежи' }),
];

const current = [
  rating({ appeal_date: '2026-05-01', mark: 1, problem: 'Выписка' }),
  rating({ appeal_date: '2026-05-01', mark: 5, problem: 'Платежи' }),
  rating({ appeal_date: '2026-05-02', mark: 5, problem: 'Выписка' }),
  rating({ appeal_date: '2026-05-02', mark: 1, problem: 'Платежи' }),
];

test('INS-1 daily insights SHOULD compare matching days of current and previous periods', () => {
  const insights = buildInsights(previous, current, previousPeriod, currentPeriod, project);

  assert.deepEqual(
    insights.map(({ date, kind, delta, voc }) => ({ date, kind, delta, voc })),
    [
      { date: '2026-05-01', kind: 'fall', delta: -2, voc: 3 },
      { date: '2026-05-02', kind: 'rise', delta: 2, voc: 3 },
    ],
  );
});

test('INS-2 each insight SHOULD explain the change with the strongest same-slice contribution', () => {
  const insights = buildInsights(previous, current, previousPeriod, currentPeriod, project);

  assert.deepEqual(insights.map(({ cause }) => cause), ['Выписка', 'Выписка']);
  assert.ok(insights.every(({ impact }) => Number.isFinite(impact)));
});

test('INS-3 no comparable or displayed change SHOULD produce no fabricated event', () => {
  const same = previous.map((row, index) => ({
    ...row,
    voc_ccode: `same-${index}`,
    appeal_date: row.appeal_date.replace('2026-04', '2026-05'),
  }));

  assert.deepEqual(buildInsights(previous, same, previousPeriod, currentPeriod, project), []);
  assert.deepEqual(buildInsights([], current, previousPeriod, currentPeriod, project), []);
});

test('INS-4 sorting SHOULD support influence and newest-first chronology', () => {
  const rows = [
    { date: '2026-05-01', delta: -4 },
    { date: '2026-05-03', delta: 1 },
    { date: '2026-05-02', delta: 2 },
  ];

  assert.deepEqual(sortInsights(rows, 'influence').map(({ date }) => date), [
    '2026-05-01',
    '2026-05-02',
    '2026-05-03',
  ]);
  assert.deepEqual(sortInsights(rows, 'chronology').map(({ date }) => date), [
    '2026-05-03',
    '2026-05-02',
    '2026-05-01',
  ]);
});

test('INS-4 sorting SHOULD reject an unknown mode', () => {
  assert.throws(() => sortInsights([], 'random'), /Режим сортировки/);
});

test('INS-5 focused comparison SHOULD use the same ordinal day as the insight', () => {
  const may = { from: '2026-05-01', to: '2026-05-31' };
  const april = { from: '2026-04-01', to: '2026-04-30' };
  assert.equal(previousDateForFocus('2026-05-21', may, april), '2026-04-21');
  assert.equal(previousDateForFocus('2026-05-31', may, april), null);
  assert.equal(previousDateForFocus('2026-06-01', currentPeriod, previousPeriod), null);
});
