import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCALE_OPTIONS, buildTimeSeries, recommendedScale } from '../site/js/timeseries.js';

const rating = (appealDate, mark, id) => ({
  voc_ccode: id ?? `${appealDate}-${mark}`,
  appeal_date: appealDate,
  mark,
});

test('DYN-2 day series SHOULD preserve empty calendar days as gaps', () => {
  const rows = [rating('2026-05-01', 5, 'a'), rating('2026-05-01', 3, 'b'), rating('2026-05-03', 1, 'c')];

  assert.deepEqual(buildTimeSeries(rows, { from: '2026-05-01', to: '2026-05-03' }, 'day'), [
    { from: '2026-05-01', to: '2026-05-01', voc: 4, count: 2 },
    { from: '2026-05-02', to: '2026-05-02', voc: null, count: 0 },
    { from: '2026-05-03', to: '2026-05-03', voc: 1, count: 1 },
  ]);
});

test('DYN-3 month series SHOULD average ratings, not daily VOC values', () => {
  const rows = [
    rating('2026-05-01', 1, 'low'),
    ...Array.from({ length: 9 }, (_, index) => rating('2026-05-02', 5, `high-${index}`)),
  ];

  assert.deepEqual(buildTimeSeries(rows, { from: '2026-05-01', to: '2026-05-31' }, 'month'), [
    { from: '2026-05-01', to: '2026-05-31', voc: 4.6, count: 10 },
  ]);
});

test('DYN-2 week series SHOULD use Monday boundaries and clip edge buckets to the period', () => {
  const rows = [rating('2026-05-01', 5, 'first'), rating('2026-05-04', 4, 'second')];

  assert.deepEqual(buildTimeSeries(rows, { from: '2026-05-01', to: '2026-05-15' }, 'week'), [
    { from: '2026-05-01', to: '2026-05-03', voc: 5, count: 1 },
    { from: '2026-05-04', to: '2026-05-10', voc: 4, count: 1 },
    { from: '2026-05-11', to: '2026-05-15', voc: null, count: 0 },
  ]);
});

test('DYN-2 month and quarter scales SHOULD clip buckets to a custom period', () => {
  assert.deepEqual(
    buildTimeSeries([], { from: '2026-02-15', to: '2026-07-10' }, 'quarter').map(({ from, to }) => ({ from, to })),
    [
      { from: '2026-02-15', to: '2026-03-31' },
      { from: '2026-04-01', to: '2026-06-30' },
      { from: '2026-07-01', to: '2026-07-10' },
    ],
  );
});

test('DYN-7 scales and automatic readable defaults SHOULD stay stable', () => {
  assert.deepEqual(SCALE_OPTIONS.map(({ value, label }) => [value, label]), [
    ['day', 'Дни'],
    ['week', 'Недели'],
    ['month', 'Месяцы'],
    ['quarter', 'Кварталы'],
  ]);
  assert.equal(recommendedScale({ from: '2026-05-01', to: '2026-05-31' }), 'day');
  assert.equal(recommendedScale({ from: '2026-01-01', to: '2026-12-31' }), 'week');
  assert.equal(recommendedScale({ from: '2024-01-01', to: '2026-12-31' }), 'month');
  assert.equal(recommendedScale({ from: '2021-01-01', to: '2026-12-31' }), 'quarter');
});

test('DYN-2 unknown scale MUST fail instead of silently changing aggregation', () => {
  assert.throws(
    () => buildTimeSeries([], { from: '2026-05-01', to: '2026-05-31' }, 'year'),
    /Неизвестный масштаб/,
  );
});
