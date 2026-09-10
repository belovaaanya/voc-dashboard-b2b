import { test } from 'node:test';
import assert from 'node:assert/strict';

import { distributionForDisplay } from '../site/js/distribution.js';
import { voc } from '../site/js/metrics.js';
import { roundVoc } from '../site/js/round.js';
import { ratingsWithMarks } from './helpers/ratings.js';

test('DIST-1 distribution SHOULD keep all five marks, counts and display shares', () => {
  const distribution = distributionForDisplay(ratingsWithMarks([1, 2, 3]));

  assert.deepEqual(
    distribution.map(({ mark, count, share }) => ({ mark, count, share })),
    [
      { mark: 1, count: 1, share: 33.3 },
      { mark: 2, count: 1, share: 33.4 },
      { mark: 3, count: 1, share: 33.3 },
      { mark: 4, count: 0, share: 0 },
      { mark: 5, count: 0, share: 0 },
    ],
  );
  assert.equal(distribution.reduce((sum, bucket) => sum + Math.round(bucket.share * 10), 0), 1000);
});

test('DIST-2 empty distribution SHOULD preserve five undefined shares', () => {
  assert.deepEqual(distributionForDisplay([]), [
    { mark: 1, count: 0, share: null },
    { mark: 2, count: 0, share: null },
    { mark: 3, count: 0, share: null },
    { mark: 4, count: 0, share: null },
    { mark: 5, count: 0, share: null },
  ]);
});

test('DIST-3 equal remainders SHOULD keep the displayed distribution consistent with displayed VOC (V-22)', () => {
  const ratings = ratingsWithMarks([1, 2, 3, 4, 4, 5]);
  const distribution = distributionForDisplay(ratings);
  const restoredVoc = distribution.reduce((sum, bucket) => sum + bucket.mark * bucket.share, 0) / 100;

  assert.equal(roundVoc(restoredVoc), roundVoc(voc(ratings)));
});
