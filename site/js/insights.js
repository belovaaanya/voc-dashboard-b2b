import { decomposeVocChange } from './impact.js';
import { roundDelta } from './round.js';
import { buildTimeSeries } from './timeseries.js';

function rowsByDate(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const bucket = grouped.get(row.appeal_date) ?? [];
    bucket.push(row);
    grouped.set(row.appeal_date, bucket);
  }
  return grouped;
}

function strongestCause(contributions, kind) {
  const ordered = [...contributions].sort((left, right) =>
    kind === 'fall' ? left.impact - right.impact : right.impact - left.impact,
  );
  const candidate = ordered[0];
  if (!candidate || (kind === 'fall' ? candidate.impact >= 0 : candidate.impact <= 0)) return null;
  return candidate;
}

export function previousDateForFocus(focus, currentPeriod, previousPeriod) {
  const current = buildTimeSeries([], currentPeriod, 'day');
  const index = current.findIndex(({ from }) => from === focus);
  if (index < 0) return null;
  return buildTimeSeries([], previousPeriod, 'day')[index]?.from ?? null;
}

export function buildInsights(previous, current, previousPeriod, currentPeriod, project) {
  const previousSeries = buildTimeSeries(previous, previousPeriod, 'day');
  const currentSeries = buildTimeSeries(current, currentPeriod, 'day');
  const previousRows = rowsByDate(previous);
  const currentRows = rowsByDate(current);
  const length = Math.min(previousSeries.length, currentSeries.length);
  const insights = [];

  for (let index = 0; index < length; index += 1) {
    const before = previousSeries[index];
    const after = currentSeries[index];
    if (before.voc === null || after.voc === null) continue;

    const delta = after.voc - before.voc;
    if (roundDelta(delta) === 0) continue;
    const kind = delta < 0 ? 'fall' : 'rise';
    const decomposition = decomposeVocChange(
      previousRows.get(before.from) ?? [],
      currentRows.get(after.from) ?? [],
      project,
    );
    const cause = strongestCause(decomposition.contributions, kind);

    insights.push({
      date: after.from,
      previousDate: before.from,
      kind,
      delta,
      voc: after.voc,
      cause: cause?.key ?? null,
      impact: cause?.impact ?? null,
    });
  }

  return insights;
}

export function sortInsights(insights, mode = 'influence') {
  const copy = [...insights];
  if (mode === 'influence') {
    return copy.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || right.date.localeCompare(left.date));
  }
  if (mode === 'chronology') return copy.sort((left, right) => right.date.localeCompare(left.date));
  throw new Error(`Режим сортировки не поддерживается: ${mode}`);
}
