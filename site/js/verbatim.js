import { decomposeVocChange } from './impact.js';
import { buildTimeSeries } from './timeseries.js';

const EMPTY_LABEL = 'Без разметки';

export function validateVerbatim(verbatim) {
  if (!verbatim || typeof verbatim !== 'object' || Array.isArray(verbatim)) {
    throw new Error('verbatim: ожидался объект');
  }
  if (!verbatim.items || typeof verbatim.items !== 'object' || Array.isArray(verbatim.items)) {
    throw new Error('verbatim.items: ожидался объект по voc_ccode');
  }
  return verbatim.items;
}

function commentFor(items, row) {
  const value = items[row.voc_ccode]?.client_comment;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function groupByProblem(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.problem) continue;
    const group = groups.get(row.problem) ?? [];
    group.push(row);
    groups.set(row.problem, group);
  }
  return groups;
}

function dominantCategory(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row.domain || row.problem_type || EMPTY_LABEL;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru'))[0]?.[0] ?? EMPTY_LABEL;
}

function representativeQuote(rows, items, mode) {
  return rows
    .map((row) => ({ id: row.voc_ccode, date: row.appeal_date, rating: row.mark, comment: commentFor(items, row) }))
    .filter(({ comment }) => comment)
    .sort((left, right) => mode === 'emerging'
      ? right.date.localeCompare(left.date)
        || left.rating - right.rating
        || left.comment.length - right.comment.length
        || left.id.localeCompare(right.id)
      : left.rating - right.rating || left.comment.length - right.comment.length || left.id.localeCompare(right.id))[0]?.comment ?? null;
}

function trendFor(rows, groupRows, period) {
  const totals = buildTimeSeries(rows, period, 'day');
  const counts = buildTimeSeries(groupRows, period, 'day');
  const trend = totals.map((total, index) => ({
    from: total.from,
    to: total.to,
    count: counts[index].count,
    total: total.count,
    share: total.count ? (counts[index].count / total.count) * 100 : null,
  }));
  const values = trend.map(({ share }) => share).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  return { trend, trendDomain: min === max ? { min: min - 1, max: max + 1 } : { min, max } };
}

function cardOrder(mode) {
  if (mode === 'frequent') {
    return (left, right) => right.currentShare - left.currentShare || left.key.localeCompare(right.key, 'ru');
  }
  if (mode === 'emerging') {
    return (left, right) => right.lastSeen.localeCompare(left.lastSeen)
      || right.currentShare - left.currentShare
      || left.key.localeCompare(right.key, 'ru');
  }
  throw new Error(`Неизвестный вид прямой речи: ${mode}`);
}

export function buildProblemCards(previous, current, period, verbatim, mode = 'frequent', limit = 5) {
  const items = validateVerbatim(verbatim);
  if (!current.length) return [];

  const previousGroups = groupByProblem(previous);
  const currentGroups = groupByProblem(current);
  const impactByProblem = new Map(
    decomposeVocChange(previous, current, (row) => [row.problem].filter(Boolean))
      .contributions.map((item) => [item.key, item.impact]),
  );

  const cards = [...currentGroups.entries()].map(([key, rows]) => {
    const previousCount = previousGroups.get(key)?.length ?? 0;
    const currentShare = (rows.length / current.length) * 100;
    const previousShare = previous.length ? (previousCount / previous.length) * 100 : 0;
    return {
      key,
      category: dominantCategory(rows),
      count: rows.length,
      currentShare,
      previousShare,
      shareDelta: currentShare - previousShare,
      lastSeen: rows.reduce((latest, row) => row.appeal_date > latest ? row.appeal_date : latest, ''),
      impact: impactByProblem.get(key) ?? null,
      quote: representativeQuote(rows, items, mode),
      ...trendFor(current, rows, period),
    };
  }).filter(({ quote }) => quote);

  return cards.sort(cardOrder(mode)).slice(0, limit);
}

export function buildVerbatimRows(rows, verbatim) {
  const items = validateVerbatim(verbatim);
  return rows
    .map((row) => {
      const comment = commentFor(items, row);
      if (!comment) return null;
      return {
        vocCcode: row.voc_ccode,
        date: row.appeal_date,
        channel: row.channel,
        segment: row.segment || '—',
        trigger: row.operations?.length ? row.operations.join(' · ') : '—',
        category: row.problem || row.problem_type || row.domain || EMPTY_LABEL,
        rating: row.mark,
        comment,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.date.localeCompare(left.date) || left.vocCcode.localeCompare(right.vocCcode));
}

export function searchVerbatimRows(rows, query) {
  const needle = String(query ?? '').trim().toLocaleLowerCase('ru');
  if (!needle) return rows;
  return rows.filter((row) => Object.values(row)
    .some((value) => String(value ?? '').toLocaleLowerCase('ru').includes(needle)));
}
