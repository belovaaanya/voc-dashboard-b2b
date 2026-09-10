import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roundVoc, roundDelta, roundImpact, roundShares } from '../site/js/round.js';
import { voc, markDistribution } from '../site/js/metrics.js';
import { ratingsWithMarks } from './helpers/ratings.js';

test('AC-21 rounding SHOULD use the display digits of D-21', () => {
  assert.equal(roundVoc(4.7849), 4.78);
  assert.equal(roundVoc(4.786), 4.79);
  assert.equal(roundDelta(-0.1234), -0.12);
  assert.equal(roundDelta(0.126), 0.13);
  assert.equal(roundImpact(-0.12345), -0.123);
  assert.equal(roundImpact(-0.12351), -0.124);
});

test('AC-21 metrics SHOULD keep full precision so only the display rounds', () => {
  const slice = ratingsWithMarks([1, 1, 2]);

  assert.equal(voc(slice), 4 / 3);
  assert.equal(roundVoc(voc(slice)), 1.33);
});

test('AC-21 rounding SHOULD pass null through instead of turning it into a number', () => {
  assert.equal(roundVoc(null), null);
  assert.equal(roundDelta(null), null);
  assert.equal(roundImpact(null), null);
});

test('AC-21 rounding SHOULD never hand a negative zero to the display', () => {
  assert.ok(Object.is(roundVoc(-0), 0), 'VOC не бывает «−0,00»');
  assert.ok(Object.is(roundDelta(-0.0001), 0));
  assert.ok(Object.is(roundImpact(-0.0001), 0));
});

test('AC-7a roundShares SHOULD make displayed shares sum to exactly 100', () => {
  const thirds = markDistribution(ratingsWithMarks([1, 2, 3])).map(({ share }) => share);
  const rounded = roundShares(thirds);

  assert.equal(
    rounded.reduce((sum, share) => sum + share, 0),
    100,
  );
  for (const [index, share] of rounded.entries()) {
    assert.ok(
      Math.abs(share - thirds[index]) < 1,
      `доля ${share} ушла от точной ${thirds[index]} больше чем на процент`,
    );
  }
});

test('AC-7a roundShares SHOULD give the spare percent to the largest remainder', () => {
  assert.deepEqual(roundShares([4.6, 7.2, 10.1, 25.3, 52.8]), [5, 7, 10, 25, 53]);
});

test('AC-7a roundShares SHOULD leave already whole shares alone', () => {
  assert.deepEqual(roundShares([25, 0, 0, 0, 75]), [25, 0, 0, 0, 75]);
});

test('AC-7a roundShares WHEN the slice is empty SHOULD keep the shares undefined', () => {
  const empty = markDistribution([]).map(({ share }) => share);

  assert.deepEqual(roundShares(empty), [null, null, null, null, null]);
});
