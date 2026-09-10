import { test } from 'node:test';
import assert from 'node:assert/strict';

import { trendOf, vocDelta } from '../site/js/metrics.js';
import { defaultPeriod, previousPeriod } from '../site/js/period.js';
import { ratingsWithMarks } from './helpers/ratings.js';

test('AC-7 vocDelta WHEN both slices have ratings SHOULD be the difference of their VOC', () => {
  const delta = vocDelta(ratingsWithMarks([5, 5]), ratingsWithMarks([4, 5]));

  assert.equal(delta, 0.5);
});

test('AC-7 vocDelta WHEN the previous slice is empty SHOULD be null, not zero', () => {
  assert.equal(vocDelta(ratingsWithMarks([5]), []), null);
  assert.equal(vocDelta([], ratingsWithMarks([5])), null);
});

test('AC-8 trendOf WHEN delta is positive or negative SHOULD give opposite directions', () => {
  assert.equal(trendOf(0.04), 'up');
  assert.equal(trendOf(-0.04), 'down');
});

test('AC-8 trendOf WHEN delta is zero SHOULD be flat, not a direction', () => {
  assert.equal(trendOf(0), 'flat');
});

/*
  Стрелка роста рядом с подписью «+0,00» — тот же дефект, что V-15: направление
  обязано следовать показанному числу, а не полной точности
*/
test('AC-8 trendOf WHEN delta rounds away to zero SHOULD be flat, matching the shown number', () => {
  assert.equal(trendOf(0.004), 'flat');
  assert.equal(trendOf(-0.004), 'flat');
});

test('AC-8 trendOf WHEN there is no delta SHOULD be null', () => {
  assert.equal(trendOf(null), null);
  assert.equal(trendOf(Number.NaN), null);
});

test('AC-7 defaultPeriod WHEN the export ends on a month boundary SHOULD give that whole month', () => {
  const period = defaultPeriod({ from: '2026-04-01', to: '2026-05-31', current: '2026-05' });

  assert.deepEqual(period, { preset: 'month', from: '2026-05-01', to: '2026-05-31', complete: true });
  assert.deepEqual(
    { from: previousPeriod(period).from, to: previousPeriod(period).to },
    { from: '2026-04-01', to: '2026-04-30' },
  );
});

test('AC-7 defaultPeriod WHEN the export ends mid-month SHOULD align the comparison by day count (D-24)', () => {
  const period = defaultPeriod({ from: '2026-04-01', to: '2026-05-10', current: '2026-05' });

  assert.equal(period.complete, false);
  assert.deepEqual(
    { from: previousPeriod(period).from, to: previousPeriod(period).to },
    { from: '2026-04-01', to: '2026-04-10' },
  );
});

/*
  Positive control: манифест, чьи period.current и period.to указывают на разные
  месяцы, противоречив — молчаливый выбор одного из полей прятал бы сломанную сборку
*/
test('D-41 defaultPeriod WHEN manifest fields disagree SHOULD throw instead of picking one', () => {
  assert.throws(
    () => defaultPeriod({ from: '2026-04-01', to: '2026-05-31', current: '2026-04' }),
    /противоречив/,
  );
});
