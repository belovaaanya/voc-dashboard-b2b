import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  voc,
  ratingCount,
  lowRatingCount,
  markDistribution,
  groupBy,
  summarize,
} from '../site/js/metrics.js';
import { rating, ratingsWithMarks } from './helpers/ratings.js';

/**
 * Три оценки `5` за 1 мая и одна `1` за 2 мая: среднее по оценкам `4`,
 * среднее дневных VOC — `3`. Набор существует ровно для того, чтобы эти два
 * числа не совпадали (`D-07`).
 */
function unequalDays() {
  return [
    ...ratingsWithMarks([5, 5, 5], { appeal_date: '2026-05-01' }),
    ...ratingsWithMarks([1], { appeal_date: '2026-05-02' }),
  ];
}

test('AC-5 voc WHEN days have unequal counts SHOULD average ratings, not daily averages', () => {
  const slice = unequalDays();

  const meanOfDailyVoc =
    (voc(slice.filter((r) => r.appeal_date === '2026-05-01')) +
      voc(slice.filter((r) => r.appeal_date === '2026-05-02'))) /
    2;

  assert.equal(voc(slice), 4);
  assert.equal(meanOfDailyVoc, 3);
  assert.notEqual(voc(slice), meanOfDailyVoc);
});

test('AC-6 counts SHOULD count ratings and low ratings', () => {
  const slice = ratingsWithMarks([1, 2, 3, 4, 5]);

  assert.equal(ratingCount(slice), 5);
  assert.equal(lowRatingCount(slice), 2);
});

test('AC-7 markDistribution SHOULD keep all five marks and shares of the slice', () => {
  const distribution = markDistribution(ratingsWithMarks([5, 5, 5, 1]));

  assert.deepEqual(
    distribution.map(({ mark, count }) => [mark, count]),
    [[1, 1], [2, 0], [3, 0], [4, 0], [5, 3]],
  );
  assert.deepEqual(
    distribution.map(({ share }) => share),
    [25, 0, 0, 0, 75],
  );
});

test('AC-7 markDistribution WHEN the slice is indivisible SHOULD keep full precision shares summing to 100', () => {
  const distribution = markDistribution(ratingsWithMarks([1, 2, 3]));
  const total = distribution.reduce((sum, { share }) => sum + share, 0);

  assert.ok(Math.abs(total - 100) < 1e-12, `сумма долей ${total}`);
  assert.equal(distribution[0].share, 100 / 3);
});

test('AC-8 groupBy SHOULD partition the slice by date, channel and segment', () => {
  const slice = [
    rating({ appeal_date: '2026-05-01', channel: 'АБМ', segment: 'СБ', mark: 4 }),
    rating({ appeal_date: '2026-05-01', channel: 'НИБ', segment: 'ММБ', mark: 2 }),
    rating({ appeal_date: '2026-05-02', channel: 'АБМ', segment: 'СБ', mark: 5 }),
  ];

  for (const select of [
    (r) => r.appeal_date,
    (r) => r.channel,
    (r) => r.segment,
  ]) {
    const groups = groupBy(slice, select);
    const grouped = groups.reduce((sum, group) => sum + group.ratings.length, 0);

    assert.equal(grouped, slice.length);
  }

  assert.deepEqual(
    groupBy(slice, (r) => r.appeal_date).map(({ key, ratings }) => [key, ratings.length]),
    [['2026-05-01', 2], ['2026-05-02', 1]],
  );
});

test('AC-8 groupBy SHOULD order groups by key so rendering is stable', () => {
  const slice = [
    rating({ appeal_date: '2026-05-03' }),
    rating({ appeal_date: '2026-05-01' }),
    rating({ appeal_date: '2026-05-02' }),
  ];

  assert.deepEqual(
    groupBy(slice, (r) => r.appeal_date).map(({ key }) => key),
    ['2026-05-01', '2026-05-02', '2026-05-03'],
  );
});

test('summarize SHOULD report the second metrics row of D-15 in full precision', () => {
  const summary = summarize(ratingsWithMarks([1, 2, 5]));

  assert.equal(summary.count, 3);
  assert.equal(summary.lowCount, 2);
  assert.equal(summary.voc, 8 / 3);
  assert.equal(summary.share5, 100 / 3);
});
