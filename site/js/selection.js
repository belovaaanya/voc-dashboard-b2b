import { customPeriod, previousPeriod } from './period.js';

function matchesFilters(row, state, dimensions, reference) {
  for (const dimension of dimensions) {
    const selected = state.filters?.[dimension.key];
    if (!selected?.length) continue;
    const values = dimension.values(row, reference).filter(Boolean);
    if (!values.some((value) => selected.includes(value))) return false;
  }
  return true;
}

function sliceRows(rows, state, period, dimensions, reference) {
  return rows.filter(
    (row) =>
      (!state.channel || row.channel === state.channel) &&
      row.appeal_date >= period.from &&
      row.appeal_date <= period.to &&
      matchesFilters(row, state, dimensions, reference),
  );
}

function selectedPeriod(overrides, globalPeriod) {
  const hasFrom = Object.hasOwn(overrides, 'from');
  const hasTo = Object.hasOwn(overrides, 'to');
  if (hasFrom !== hasTo) throw new Error('Локальный период требует одновременно from и to');
  return hasFrom ? customPeriod(overrides.from, overrides.to) : globalPeriod;
}

export function createSelector({ rows, state, period: globalPeriod, dimensions, reference }) {
  return (overrides = {}) => {
    const period = selectedPeriod(overrides, globalPeriod);
    const previous = previousPeriod(period);
    const selectedState = { ...state, ...overrides, from: period.from, to: period.to };

    return {
      rows: sliceRows(rows, selectedState, period, dimensions, reference),
      previous: sliceRows(rows, selectedState, previous, dimensions, reference),
      period,
      previousPeriod: previous,
    };
  };
}
