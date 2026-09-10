import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deltaOf, trendOf, vocDelta } from '../site/js/metrics.js';
import { defaultPeriod, previousPeriod } from '../site/js/period.js';
import { DELTA_SHAPES } from '../site/js/blocks/metric-card.js';
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

test('AC-8 trendOf WHEN there is no delta SHOULD be null', () => {
  assert.equal(trendOf(null), null);
  assert.equal(trendOf(undefined), null);
  assert.equal(trendOf(Number.NaN), null);
});

test('AC-7 deltaOf WHEN either side is undefined SHOULD be null, not a number', () => {
  assert.equal(deltaOf(10, null), null);
  assert.equal(deltaOf(null, 10), null);
  assert.equal(deltaOf(10, 7), 3);
});

/*
  Стрелка роста рядом с подписью «+0,0» — тот же дефект, что V-15: направление
  обязано следовать показанному числу. Точность у каждого показателя своя,
  поэтому пара «округление + формат» проверяется целиком, а не по частям
*/
test('AC-8 DELTA_SHAPES WHEN a delta rounds away at its own precision SHOULD read as flat', () => {
  const vanishing = { voc: 0.004, count: 0.4, share: 0.04 };

  for (const [name, delta] of Object.entries(vanishing)) {
    const shape = DELTA_SHAPES[name];
    assert.equal(shape.round(delta), 0, `${name}: число обязано округлиться в ноль`);
    assert.equal(trendOf(shape.round(delta)), 'flat', `${name}: стрелка противоречит подписи`);
    assert.equal(trendOf(shape.round(-delta)), 'flat', `${name}: стрелка противоречит подписи`);
  }
});

test('AC-8 DELTA_SHAPES WHEN a delta survives its own precision SHOULD keep its direction', () => {
  const surviving = { voc: 0.04, count: 4, share: 0.4 };

  for (const [name, delta] of Object.entries(surviving)) {
    const shape = DELTA_SHAPES[name];
    assert.equal(trendOf(shape.round(delta)), 'up', `${name}: рост потерян`);
    assert.equal(trendOf(shape.round(-delta)), 'down', `${name}: падение потеряно`);
    assert.match(shape.format(shape.round(delta)), /^\+/, `${name}: у положительной дельты нет знака`);
  }
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
