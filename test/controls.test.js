import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PERIOD_PRESETS,
  periodFromState,
  periodForPreset,
  validateCustomPeriod,
  toggleSelectedValue,
} from '../site/js/controls.js';
import { DIMENSIONS } from '../site/js/dimensions.js';
import { defaultPeriod, previousPeriod } from '../site/js/period.js';
import { readState, toSearch } from '../site/js/url-state.js';

test('AC-1 period controls SHOULD expose the five presets from requirements 2.1', () => {
  assert.deepEqual(
    PERIOD_PRESETS.map(({ value, label }) => [value, label]),
    [
      ['month', 'Месяц'],
      ['half-year', 'Полгода'],
      ['calendar-year', 'Год'],
      ['days-365', '365 дней'],
      ['years-5', '5 лет'],
    ],
  );
});

test('AC-1 preset SHOULD be anchored to the last export date (D-41)', () => {
  assert.deepEqual(periodForPreset('calendar-year', { to: '2026-05-31' }), {
    preset: 'calendar-year',
    from: '2026-01-01',
    to: '2026-05-31',
    complete: false,
  });
  assert.deepEqual(periodForPreset('days-365', { to: '2026-05-31' }), {
    preset: 'days-365',
    from: '2025-06-01',
    to: '2026-05-31',
    complete: true,
  });
});

test('AC-1 calendar preset SHOULD keep calendar comparison after URL round-trip', () => {
  const manifestPeriod = { current: '2026-05', to: '2026-05-31' };
  const selected = periodForPreset('month', manifestPeriod);
  const restoredState = readState(toSearch({ ...selected, channel: 'АБМ', filters: {} }));
  const restored = periodFromState(restoredState, defaultPeriod(manifestPeriod), manifestPeriod);

  assert.deepEqual(previousPeriod(restored), {
    preset: 'month',
    from: '2026-04-01',
    to: '2026-04-30',
    complete: true,
  });
});

test('AC-1 preset guard SHOULD reject a manifest without the export end date', () => {
  assert.throws(() => periodForPreset('month', {}), /period\.to/);
});

test('AC-2 custom period validation SHOULD keep incomplete and reversed ranges unapplied', () => {
  assert.deepEqual(validateCustomPeriod('', '2026-05-31'), {
    period: null,
    error: 'Выберите начало и конец периода',
  });
  assert.deepEqual(validateCustomPeriod('2026-06-01', '2026-05-31'), {
    period: null,
    error: 'Начало периода должно быть не позже конца',
  });
});

test('AC-2 custom period validation SHOULD return a valid period', () => {
  assert.deepEqual(validateCustomPeriod('2026-05-10', '2026-05-20'), {
    period: {
      preset: 'custom',
      from: '2026-05-10',
      to: '2026-05-20',
      complete: true,
    },
    error: null,
  });
});

test('AC-4 filter draft SHOULD toggle values without mutating the current selection', () => {
  const selected = ['ММБ'];

  assert.deepEqual(toggleSelectedValue(selected, 'СБ'), ['ММБ', 'СБ']);
  assert.deepEqual(toggleSelectedValue(selected, 'ММБ'), []);
  assert.deepEqual(selected, ['ММБ']);
});

test('AC-3 dimensions SHOULD omit unsupported roles and regions and call scenarios triggers', () => {
  assert.deepEqual(DIMENSIONS.map(({ key }) => key), ['segment', 'trigger', 'cp', 'product', 'domain']);
  assert.equal(DIMENSIONS.find(({ key }) => key === 'trigger').title, 'Триггеры');
  assert.equal(DIMENSIONS.some(({ title }) => ['Роли', 'ФО', 'Сценарии'].includes(title)), false);
});
