import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABOVE_PLAN,
  BELOW_PLAN,
  IN_PLAN,
  planFor,
  planForSlice,
  planStatus,
} from '../site/js/plan.js';

const MAY = { from: '2026-05-01', to: '2026-05-31' };

const PLANS = [
  { channel: 'АБМ', segment: null, period_from: '2026-05-01', period_to: '2026-05-31', min: 4.85, max: 4.95 },
  { channel: 'АБМ', segment: 'СБ', period_from: '2026-05-01', period_to: '2026-05-31', min: 4.8, max: 4.9 },
  { channel: 'АБМ', segment: null, period_from: '2026-04-01', period_to: '2026-04-30', min: 4.82, max: 4.9 },
  { channel: 'НИБ', segment: null, period_from: '2026-05-01', period_to: '2026-05-31', min: 4.7, max: 4.8 },
];

test('AC-10 planFor WHEN no segment selected SHOULD take the channel-wide row (segment null)', () => {
  const plan = planFor(PLANS, { channel: 'АБМ', ...MAY });

  assert.deepEqual([plan.min, plan.max], [4.85, 4.95]);
});

test('AC-10 planFor WHEN a segment is given SHOULD take that segment row, not the channel one', () => {
  const plan = planFor(PLANS, { channel: 'АБМ', segment: 'СБ', ...MAY });

  assert.deepEqual([plan.min, plan.max], [4.8, 4.9]);
});

test('AC-11 planFor WHEN the slice has no matching row SHOULD return null', () => {
  assert.equal(planFor(PLANS, { channel: 'НИБ', segment: 'КИБ', ...MAY }), null);
});

test('AC-11 planFor WHEN reference carries no plan at all SHOULD return null', () => {
  assert.equal(planFor(undefined, { channel: 'АБМ', ...MAY }), null);
});

test('D-42 planFor WHEN the period straddles two corridors SHOULD return null', () => {
  assert.equal(planFor(PLANS, { channel: 'АБМ', from: '2026-04-01', to: '2026-05-31' }), null);
});

test('D-42 planFor WHEN a non-segment filter narrows the slice SHOULD return null', () => {
  const filtered = planFor(PLANS, { channel: 'АБМ', ...MAY, filters: { product: ['Валютный контроль'] } });

  assert.equal(filtered, null);
});

test('D-42 planFor WHEN only a segment filter is set SHOULD still find the corridor', () => {
  const plan = planFor(PLANS, { channel: 'АБМ', segment: 'СБ', ...MAY, filters: { segment: ['СБ'] } });

  assert.equal(plan.min, 4.8);
});

test('D-42 planForSlice WHEN two segments are selected SHOULD return null — that is neither channel nor segment', () => {
  assert.equal(planForSlice(PLANS, { channel: 'АБМ', ...MAY, filters: { segment: ['ММБ', 'СБ'] } }), null);
});

test('D-42 planForSlice WHEN one segment is selected SHOULD take that segment corridor', () => {
  const plan = planForSlice(PLANS, { channel: 'АБМ', ...MAY, filters: { segment: ['СБ'] } });

  assert.equal(plan.min, 4.8);
});

test('AC-9 planStatus WHEN value rounds onto the upper bound SHOULD read as in plan (D-22)', () => {
  const plan = { min: 4.69, max: 4.78 };

  assert.equal(planStatus(4.784, plan), IN_PLAN);
});

test('AC-9 planStatus WHEN value rounds past the upper bound SHOULD read as above plan', () => {
  const plan = { min: 4.69, max: 4.78 };

  assert.equal(planStatus(4.786, plan), ABOVE_PLAN);
});

test('AC-9 planStatus WHEN value sits exactly on a bound SHOULD read as in plan — bounds inclusive', () => {
  const plan = { min: 4.69, max: 4.78 };

  assert.equal(planStatus(4.78, plan), IN_PLAN);
  assert.equal(planStatus(4.69, plan), IN_PLAN);
});

test('AC-9 planStatus WHEN value rounds below the lower bound SHOULD read as below plan', () => {
  assert.equal(planStatus(4.684, { min: 4.69, max: 4.78 }), BELOW_PLAN);
});

test('AC-11 planStatus WHEN there is no plan or no value SHOULD return null', () => {
  assert.equal(planStatus(4.9, null), null);
  assert.equal(planStatus(null, { min: 4.69, max: 4.78 }), null);
});

/*
  Positive control к предыдущему: не-число в границе обязано гасить бейдж, а не
  проваливаться в «выше плана» через сравнение с null
*/
test('AC-11 planStatus WHEN a bound is not a number SHOULD return null, not a verdict', () => {
  assert.equal(planStatus(4.9, { min: null, max: 4.95 }), null);
  assert.equal(planStatus(4.9, { min: 4.85, max: undefined }), null);
});
