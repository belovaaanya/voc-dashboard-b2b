import { test } from 'node:test';
import assert from 'node:assert/strict';

import { voc, ratingCount, lowRatingCount, markDistribution, groupBy, summarize } from '../site/js/metrics.js';
import { breakdown, UNLABELLED } from '../site/js/breakdown.js';
import { decomposeVocChange } from '../site/js/impact.js';
import { sampleSufficiency } from '../site/js/sufficiency.js';
import { roundVoc, roundShares } from '../site/js/round.js';
import { customPeriod, previousPeriod, resolvePreset, dayCount } from '../site/js/period.js';
import { rating, ratingsWithMarks } from './helpers/ratings.js';
import { assertNoNaN, assertReconcilesToSliceVoc } from './helpers/invariants.js';

const byOperations = (r) => r.operations;

test('AC-23 metrics WHEN the slice is empty SHOULD report null, not zero and not NaN', () => {
  assert.equal(voc([]), null);
  assert.equal(ratingCount([]), 0);
  assert.equal(lowRatingCount([]), 0);
  assert.deepEqual(groupBy([], (r) => r.appeal_date), []);

  const summary = summarize([]);
  assert.equal(summary.voc, null);
  assert.equal(summary.share5, null);
  assertNoNaN(summary, 'summarize');

  for (const bucket of markDistribution([])) {
    assert.equal(bucket.count, 0);
    assert.equal(bucket.share, null);
    assertNoNaN(bucket, 'markDistribution');
  }
});

test('AC-23 breakdown WHEN the slice is empty SHOULD return no groups', () => {
  assert.deepEqual(breakdown([], byOperations), []);
});

test('AC-23 core functions WHEN the slice is a single rating SHOULD still answer', () => {
  const slice = ratingsWithMarks([3]);
  const [group] = breakdown(slice, byOperations);

  assert.equal(voc(slice), 3);
  assert.equal(group.mentions, 1);
  assert.equal(group.weightedCount, 1);
  assert.equal(group.voc, 3);
  assert.equal(group.share, 100);
  assertReconcilesToSliceVoc(breakdown(slice, byOperations), slice);
  assertNoNaN(group, 'breakdown');
});

test('AC-23 breakdown WHEN every mark is identical SHOULD keep the group VOC equal to the slice VOC', () => {
  const slice = ratingsWithMarks([4, 4, 4]);
  const groups = breakdown(slice, byOperations);

  assert.equal(groups[0].voc, 4);
  assertReconcilesToSliceVoc(groups, slice);
});

test('AC-23 decomposeVocChange WHEN a period has no data SHOULD report no delta instead of NaN', () => {
  const populated = ratingsWithMarks([4]);

  for (const [previous, current] of [
    [[], populated],
    [populated, []],
    [[], []],
  ]) {
    const decomposition = decomposeVocChange(previous, current, byOperations);

    assert.equal(decomposition.delta, null);
    assert.deepEqual(decomposition.contributions, []);
    assertNoNaN(decomposition, 'decomposeVocChange');
  }
});

test('AC-23 decomposeVocChange WHEN a single rating is compared to a single rating SHOULD hold the invariant', () => {
  const decomposition = decomposeVocChange(
    [rating({ mark: 5, operations: ['Выписка'] })],
    [rating({ mark: 1, operations: ['Выписка'] })],
    byOperations,
  );

  assert.equal(decomposition.delta, -4);
  assert.equal(decomposition.contributions[0].impact, -4);
});

test('AC-23 period WHEN the range is a single day SHOULD compare it to the day before', () => {
  const oneDay = customPeriod('2026-05-10', '2026-05-10');

  assert.equal(dayCount(oneDay), 1);
  assert.deepEqual(previousPeriod(oneDay), { from: '2026-05-09', to: '2026-05-09' });
});

test('AC-23 period WHEN today is the first day of the month SHOULD give a one-day period', () => {
  const period = resolvePreset('month', '2026-05-01');

  assert.deepEqual(period, {
    preset: 'month',
    from: '2026-05-01',
    to: '2026-05-01',
    complete: false,
  });
  assert.deepEqual(previousPeriod(period), { from: '2026-04-01', to: '2026-04-01' });
});

test('AC-23 rounding WHEN the value is missing SHOULD stay missing', () => {
  assert.equal(roundVoc(null), null);
  assert.deepEqual(roundShares(markDistribution([]).map(({ share }) => share)), [
    null, null, null, null, null,
  ]);
});

test('AC-23 sampleSufficiency WHEN the slice is empty SHOULD not claim sufficiency', () => {
  const result = sampleSufficiency([]);

  assert.equal(result.sufficient, false);
  assert.equal(result.mean, null);
  assertNoNaN(result, 'sufficiency');
});

test('AC-23 breakdown WHEN every projection is blank SHOULD gather the slice into the unlabelled group', () => {
  const slice = [rating({ mark: 2, problem: null }), rating({ mark: 4, problem: '   ' })];
  const groups = breakdown(slice, (r) => [r.problem]);

  assert.deepEqual(groups.map(({ key }) => key), [UNLABELLED]);
  assert.equal(groups[0].mentions, 2);
  assertReconcilesToSliceVoc(groups, slice);
});
