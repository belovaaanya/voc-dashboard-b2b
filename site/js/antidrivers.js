import { breakdown } from './breakdown.js';
import { decomposeVocChange } from './impact.js';
import { buildTimeSeries } from './timeseries.js';

export function rankAntidrivers(previous, current, project, limit = 5) {
  const decomposition = decomposeVocChange(previous, current, project);
  const antidrivers = decomposition.contributions.filter(({ impact }) => impact < 0);
  const positiveContext = decomposition.contributions.filter(({ impact }) => impact > 0);
  const ranked = antidrivers.length ? antidrivers : positiveContext;
  return {
    ...decomposition,
    hasAntidrivers: antidrivers.length > 0,
    items: ranked.slice(0, limit),
  };
}

export function buildHeatmap(ratings, period, scale, project, keys) {
  const columns = buildTimeSeries(ratings, period, scale).map(({ from, to }) => ({ from, to }));
  const groupsByColumn = columns.map(({ from, to }) => {
    const rows = ratings.filter(({ appeal_date: date }) => date >= from && date <= to);
    return new Map(breakdown(rows, project).map((group) => [group.key, group]));
  });

  const rows = keys.map((key) => ({
    key,
    cells: groupsByColumn.map((groups) => {
      const group = groups.get(key);
      return { voc: group?.voc ?? null, mentions: group?.mentions ?? 0 };
    }),
  }));

  return { columns, rows, domain: heatmapDomain(rows) };
}

export function heatTone(value, domain) {
  if (!Number.isFinite(value)) return 'empty';
  if (!domain || domain.max === domain.min) return 'mid';
  const position = (value - domain.min) / (domain.max - domain.min);
  if (position <= 1 / 3) return 'bad';
  if (position < 2 / 3) return 'mid';
  return 'good';
}

function heatmapDomain(rows) {
  const values = rows.flatMap(({ cells }) => cells.map(({ voc }) => voc)).filter(Number.isFinite);
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}
