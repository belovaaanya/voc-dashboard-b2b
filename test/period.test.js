import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRESETS,
  resolvePreset,
  previousPeriod,
  customPeriod,
  dayCount,
} from '../site/js/period.js';

const range = ({ from, to }) => ({ from, to });

test('AC-1 resolvePreset month WHEN mid-May SHOULD return calendar May from the 1st, clamped at today', () => {
  const period = resolvePreset('month', '2026-05-10');

  assert.deepEqual(period, {
    preset: 'month',
    from: '2026-05-01',
    to: '2026-05-10',
    complete: false,
  });
});

test('AC-1 resolvePreset month WHEN last day of May SHOULD be a complete calendar month', () => {
  const period = resolvePreset('month', '2026-05-31');

  assert.deepEqual(period, {
    preset: 'month',
    from: '2026-05-01',
    to: '2026-05-31',
    complete: true,
  });
});

test('AC-2 previousPeriod WHEN complete calendar month SHOULD return the whole previous month', () => {
  const previous = previousPeriod(resolvePreset('month', '2026-05-31'));

  assert.deepEqual(range(previous), { from: '2026-04-01', to: '2026-04-30' });
});

test('AC-3 previousPeriod WHEN partial month SHOULD align by day count', () => {
  const previous = previousPeriod(resolvePreset('month', '2026-05-10'));

  assert.deepEqual(range(previous), { from: '2026-04-01', to: '2026-04-10' });
});

test('AC-4 previousPeriod WHEN partial period SHOULD have the same day span for every preset', () => {
  for (const preset of PRESETS) {
    const current = resolvePreset(preset, '2026-05-10');
    const previous = previousPeriod(current);

    assert.equal(
      dayCount(previous),
      dayCount(current),
      `${preset}: длины сравниваемых диапазонов равны`,
    );
  }
});

test('AC-4 previousPeriod WHEN complete calendar period SHOULD return the whole previous calendar period', () => {
  const halfYear = previousPeriod(resolvePreset('half-year', '2026-06-30'));
  const year = previousPeriod(resolvePreset('calendar-year', '2026-12-31'));

  assert.deepEqual(range(halfYear), { from: '2025-07-01', to: '2025-12-31' });
  assert.deepEqual(range(year), { from: '2025-01-01', to: '2025-12-31' });
});

test('AC-4a previousPeriod WHEN previous calendar period is shorter SHOULD clamp to its end', () => {
  const current = resolvePreset('month', '2026-03-29');
  const previous = previousPeriod(current);

  assert.deepEqual(range(previous), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(dayCount(current), 29);
  assert.equal(dayCount(previous), 28);
});

test('AC-4 resolvePreset days-365 SHOULD be rolling and always complete', () => {
  const current = resolvePreset('days-365', '2026-05-10');

  assert.equal(current.to, '2026-05-10');
  assert.equal(dayCount(current), 365);
  assert.equal(current.complete, true);

  const previous = previousPeriod(current);
  assert.equal(dayCount(previous), 365);
  assert.equal(previous.to, addOneDayBefore(current.from));
});

test('AC-4 resolvePreset half-year and years-5 SHOULD start at a calendar boundary', () => {
  assert.equal(resolvePreset('half-year', '2026-05-10').from, '2026-01-01');
  assert.equal(resolvePreset('half-year', '2026-08-10').from, '2026-07-01');
  assert.equal(resolvePreset('calendar-year', '2026-05-10').from, '2026-01-01');
  assert.equal(resolvePreset('years-5', '2026-05-10').from, '2022-01-01');
});

test('AC-4 previousPeriod WHEN partial half-year SHOULD start at the previous half-year boundary', () => {
  const previous = previousPeriod(resolvePreset('half-year', '2026-05-10'));

  assert.equal(previous.from, '2025-07-01');
});

test('AC-4 previousPeriod WHEN custom range SHOULD return the days immediately before it', () => {
  const previous = previousPeriod(customPeriod('2026-05-04', '2026-05-10'));

  assert.deepEqual(range(previous), { from: '2026-04-27', to: '2026-05-03' });
});

test('dayCount SHOULD count both ends of the range', () => {
  assert.equal(dayCount({ from: '2026-05-10', to: '2026-05-10' }), 1);
  assert.equal(dayCount({ from: '2026-05-01', to: '2026-05-31' }), 31);
});

test('resolvePreset WHEN preset is unknown SHOULD throw instead of guessing', () => {
  assert.throws(() => resolvePreset('quarter', '2026-05-10'), /quarter/);
});

test('PRESETS SHOULD list the five presets from requirements 2.1', () => {
  assert.deepEqual(PRESETS, [
    'month',
    'half-year',
    'calendar-year',
    'days-365',
    'years-5',
  ]);
});

function addOneDayBefore(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

test('previousPeriod WHEN preset is years-5 SHOULD return the five calendar years before the block', () => {
  const complete = previousPeriod(resolvePreset('years-5', '2026-12-31'));
  const partial = previousPeriod(resolvePreset('years-5', '2026-05-10'));

  assert.deepEqual(range(complete), { from: '2017-01-01', to: '2021-12-31' });
  assert.equal(partial.from, '2017-01-01');
});

test('previousPeriod SHOULD return a period that can be asked for its own previous one', () => {
  const may = resolvePreset('month', '2026-05-31');
  const april = previousPeriod(may);

  assert.deepEqual(april, {
    preset: 'month',
    from: '2026-04-01',
    to: '2026-04-30',
    complete: true,
  });
  assert.deepEqual(range(previousPeriod(april)), { from: '2026-03-01', to: '2026-03-31' });
});

test('previousPeriod WHEN the current period is partial SHOULD keep the alignment while chaining', () => {
  const may = resolvePreset('month', '2026-05-10');
  const april = previousPeriod(may);

  assert.equal(april.complete, false);
  assert.deepEqual(range(previousPeriod(april)), { from: '2026-03-01', to: '2026-03-10' });
});

test('resolvePreset WHEN the day does not exist in that month SHOULD throw instead of rolling over', () => {
  assert.throws(() => resolvePreset('month', '2026-02-30'), /2026-02-30/);
  assert.throws(() => resolvePreset('month', '2026-06-31'), /2026-06-31/);
  assert.throws(() => resolvePreset('month', '2026-13-01'), /2026-13-01/);
});

test('customPeriod WHEN the range is reversed SHOULD throw instead of producing negative days', () => {
  assert.throws(() => customPeriod('2026-05-10', '2026-05-01'), /2026-05-10/);
});
