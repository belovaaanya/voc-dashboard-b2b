import { test } from 'node:test';
import assert from 'node:assert/strict';

import { focusInPeriod, readState, toSearch, withFilter } from '../site/js/url-state.js';

const state = {
  channel: 'АБМ',
  preset: 'custom',
  from: '2026-04-01',
  to: '2026-04-30',
  focus: '2026-04-12',
  filters: {
    segment: ['ММБ', 'СБ'],
    trigger: ['Отправка платежа'],
    product: ['Платежи'],
  },
};

test('AC-5 URL state SHOULD round-trip channel, period, focus and multi-select filters (D-31)', () => {
  assert.deepEqual(readState(toSearch(state)), state);
});

test('AC-1 URL state SHOULD preserve a calendar preset instead of degrading it to custom', () => {
  const restored = readState(toSearch({ ...state, preset: 'month', from: '2026-05-01', to: '2026-05-31' }));

  assert.equal(restored.preset, 'month');
});

test('AC-4 changing one filter SHOULD preserve every other filter object entry', () => {
  const next = withFilter(state.filters, 'segment', ['КИБ']);

  assert.deepEqual(next, {
    segment: ['КИБ'],
    trigger: ['Отправка платежа'],
    product: ['Платежи'],
  });
  assert.deepEqual(state.filters.segment, ['ММБ', 'СБ']);
});

test('AC-4 clearing one filter SHOULD remove only its query parameter', () => {
  const nextState = { ...state, filters: withFilter(state.filters, 'segment', []) };
  const search = toSearch(nextState);

  assert.equal(search.includes('segment='), false);
  assert.match(search, /trigger=/);
  assert.match(search, /product=/);
});

test('AC-5 malformed dates SHOULD be dropped instead of entering dashboard state', () => {
  const parsed = readState('?channel=АБМ&from=01.04.26&to=2026-04-30&focus=12.04.26');

  assert.equal(parsed.from, null);
  assert.equal(parsed.to, '2026-04-30');
  assert.equal(parsed.focus, null);
});

test('AC-5 positive control: removing one query parameter MUST change the restored state', () => {
  const damaged = new URLSearchParams(toSearch(state));
  damaged.delete('product');

  assert.notDeepEqual(readState(`?${damaged.toString()}`), state);
});

test('INS-1 focus SHOULD survive only inside the resolved global period', () => {
  const period = { from: '2026-05-01', to: '2026-05-31' };

  assert.equal(focusInPeriod('2026-05-17', period), '2026-05-17');
  assert.equal(focusInPeriod('2026-04-30', period), null);
  assert.equal(focusInPeriod('2026-06-01', period), null);
  assert.equal(focusInPeriod(null, period), null);
});

test('INS-1 calendar-impossible focus SHOULD be rejected before it reaches local selection', () => {
  assert.equal(readState('?from=2026-02-01&to=2026-02-28&focus=2026-02-30').focus, null);
});
