import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSelector } from '../site/js/selection.js';
import { customPeriod } from '../site/js/period.js';
import { DIMENSIONS } from '../site/js/dimensions.js';
import { rating } from './helpers/ratings.js';

const rows = [
  rating({ appeal_date: '2026-05-05', segment: 'ММБ' }),
  rating({ appeal_date: '2026-04-05', segment: 'ММБ' }),
  rating({ appeal_date: '2026-04-06', segment: 'СБ' }),
  rating({ appeal_date: '2026-03-05', segment: 'ММБ' }),
];

const globalState = {
  channel: 'АБМ',
  from: '2026-05-01',
  to: '2026-05-31',
  filters: {},
};

function selector() {
  return createSelector({
    rows,
    state: globalState,
    period: customPeriod(globalState.from, globalState.to),
    dimensions: DIMENSIONS,
    reference: null,
  });
}

test('AC-6 select without a period override SHOULD use and expose the global period', () => {
  const select = selector();
  const result = select();

  assert.deepEqual(result.period, customPeriod('2026-05-01', '2026-05-31'));
  assert.deepEqual(result.rows.map((row) => row.appeal_date), ['2026-05-05']);
  assert.deepEqual(result.previous.map((row) => row.appeal_date), ['2026-04-05', '2026-04-06']);
});

test('AC-6 select with a local period SHOULD return that period and its previous slice', () => {
  const select = selector();
  const result = select({ from: '2026-04-01', to: '2026-04-30' });

  assert.deepEqual(result.period, customPeriod('2026-04-01', '2026-04-30'));
  assert.deepEqual(result.previousPeriod, customPeriod('2026-03-02', '2026-03-31'));
  assert.deepEqual(result.rows.map((row) => row.appeal_date), ['2026-04-05', '2026-04-06']);
  assert.deepEqual(result.previous.map((row) => row.appeal_date), ['2026-03-05']);
});

test('AC-6 local selection SHOULD NOT mutate global state or the next global selection', () => {
  const select = selector();
  const before = structuredClone(globalState);

  select({ from: '2026-04-01', to: '2026-04-30' });

  assert.deepEqual(globalState, before);
  assert.deepEqual(select().rows.map((row) => row.appeal_date), ['2026-05-05']);
});

test('AC-6 select SHOULD reject a half-specified local period', () => {
  const select = selector();

  assert.throws(() => select({ from: '2026-04-01' }), /from.*to|to.*from/i);
  assert.throws(() => select({ to: '2026-04-30' }), /from.*to|to.*from/i);
});

test('AC-4 select SHOULD keep filter overrides local to the requested cut', () => {
  const select = selector();
  const filtered = select({ filters: { segment: ['ММБ'] } });

  assert.deepEqual(filtered.previous.map((row) => row.segment), ['ММБ']);
  assert.deepEqual(select().previous.map((row) => row.segment), ['ММБ', 'СБ']);
});
