import { customPeriod, resolvePreset } from './period.js';

export const PERIOD_PRESETS = [
  { value: 'month', label: 'Месяц' },
  { value: 'half-year', label: 'Полгода' },
  { value: 'calendar-year', label: 'Год' },
  { value: 'days-365', label: '365 дней' },
  { value: 'years-5', label: '5 лет' },
];

export function periodForPreset(preset, manifestPeriod) {
  if (!manifestPeriod?.to) throw new Error('Манифест не содержит period.to');
  return resolvePreset(preset, manifestPeriod.to);
}

export function periodFromState(state, fallbackPeriod, manifestPeriod) {
  if (!state.from || !state.to) return fallbackPeriod;

  if (PERIOD_PRESETS.some(({ value }) => value === state.preset)) {
    const presetPeriod = periodForPreset(state.preset, manifestPeriod);
    if (presetPeriod.from === state.from && presetPeriod.to === state.to) return presetPeriod;
  }

  return customPeriod(state.from, state.to);
}

export function validateCustomPeriod(from, to) {
  if (!from || !to) return { period: null, error: 'Выберите начало и конец периода' };
  if (from > to) return { period: null, error: 'Начало периода должно быть не позже конца' };

  try {
    return { period: customPeriod(from, to), error: null };
  } catch {
    return { period: null, error: 'Введите корректные даты' };
  }
}

export function toggleSelectedValue(selected, value) {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
}
