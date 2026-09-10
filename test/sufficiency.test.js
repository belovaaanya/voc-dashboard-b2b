import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PRECISION_THRESHOLD,
  sampleSufficiency,
} from '../site/js/sufficiency.js';
import { ratingsWithMarks } from './helpers/ratings.js';
import { assertNoNaN } from './helpers/invariants.js';

const alternating = (count) =>
  ratingsWithMarks(Array.from({ length: count }, (_, index) => (index % 2 === 0 ? 4 : 5)));

test('AC-18 sampleSufficiency SHOULD return the mean, the interval and the half width', () => {
  const result = sampleSufficiency(ratingsWithMarks([1, 5]));

  assert.equal(result.n, 2);
  assert.equal(result.mean, 3);
  assert.ok(Math.abs(result.halfWidth - 3.92) < 1e-9, `полуширина ${result.halfWidth}`);
  assert.ok(Math.abs(result.low - (3 - 3.92)) < 1e-9);
  assert.ok(Math.abs(result.high - (3 + 3.92)) < 1e-9);
  assert.equal(result.sufficient, false);
});

test('AC-18 DEFAULT_PRECISION_THRESHOLD SHOULD be 0.1 of a mark', () => {
  assert.equal(DEFAULT_PRECISION_THRESHOLD, 0.1);
});

test('AC-18 sampleSufficiency SHOULD accept a threshold that overrides the default', () => {
  const ratings = ratingsWithMarks([1, 5]);

  assert.equal(sampleSufficiency(ratings).sufficient, false);
  assert.equal(sampleSufficiency(ratings, 4).sufficient, true);
  assert.equal(sampleSufficiency(ratings, 4).threshold, 4);
});

test('AC-18 sampleSufficiency SHOULD call a sample sufficient once the interval is tight enough', () => {
  const tight = sampleSufficiency(alternating(100));
  const loose = sampleSufficiency(alternating(60));

  assert.ok(tight.halfWidth < DEFAULT_PRECISION_THRESHOLD, `полуширина ${tight.halfWidth}`);
  assert.equal(tight.sufficient, true);
  assert.ok(loose.halfWidth > DEFAULT_PRECISION_THRESHOLD, `полуширина ${loose.halfWidth}`);
  assert.equal(loose.sufficient, false);
});

test('AC-19 sampleSufficiency WHEN every mark is the same SHOULD not divide by zero', () => {
  const result = sampleSufficiency(ratingsWithMarks([4, 4, 4]));

  assert.equal(result.halfWidth, 0);
  assert.equal(result.low, 4);
  assert.equal(result.high, 4);
  assert.equal(result.sufficient, true);
  assertNoNaN(result, 'sufficiency');
});

test('AC-19 sampleSufficiency WHEN there is a single rating SHOULD report an undefined interval', () => {
  const result = sampleSufficiency(ratingsWithMarks([4]));

  assert.equal(result.n, 1);
  assert.equal(result.mean, 4);
  assert.equal(result.halfWidth, null);
  assert.equal(result.low, null);
  assert.equal(result.high, null);
  assert.equal(result.sufficient, false);
  assertNoNaN(result, 'sufficiency');
});

test('AC-19 sampleSufficiency WHEN the slice is empty SHOULD report no mean at all', () => {
  const result = sampleSufficiency([]);

  assert.equal(result.n, 0);
  assert.equal(result.mean, null);
  assert.equal(result.halfWidth, null);
  assert.equal(result.sufficient, false);
  assertNoNaN(result, 'sufficiency');
});
