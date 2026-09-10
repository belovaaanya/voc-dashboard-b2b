import { voc } from './metrics.js';

const DAY_MS = 86400000;

export const SCALE_OPTIONS = [
  { value: 'day', label: 'Дни' },
  { value: 'week', label: 'Недели' },
  { value: 'month', label: 'Месяцы' },
  { value: 'quarter', label: 'Кварталы' },
];

const SCALES = new Set(SCALE_OPTIONS.map(({ value }) => value));

function parseIso(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || iso(date) !== value) throw new Error(`Не дата: ${value}`);
  return date;
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function minDate(left, right) {
  return left.getTime() <= right.getTime() ? left : right;
}

function naturalBucketEnd(start, scale) {
  if (scale === 'day') return start;
  if (scale === 'week') return shiftDays(start, (7 - start.getUTCDay()) % 7);
  if (scale === 'month') return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));

  const quarterStart = Math.floor(start.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(start.getUTCFullYear(), quarterStart + 3, 0));
}

function bucketsFor(period, scale) {
  if (!SCALES.has(scale)) throw new Error(`Неизвестный масштаб: ${scale}`);
  const first = parseIso(period.from);
  const last = parseIso(period.to);
  if (first > last) throw new Error(`Диапазон вывернут: ${period.from} … ${period.to}`);

  const buckets = [];
  let cursor = first;
  while (cursor <= last) {
    const end = minDate(naturalBucketEnd(cursor, scale), last);
    buckets.push({ from: iso(cursor), to: iso(end), ratings: [] });
    cursor = shiftDays(end, 1);
  }
  return buckets;
}

export function buildTimeSeries(ratings, period, scale = 'day') {
  const buckets = bucketsFor(period, scale);
  const bucketByDate = new Map();

  buckets.forEach((bucket, index) => {
    let cursor = parseIso(bucket.from);
    const end = parseIso(bucket.to);
    while (cursor <= end) {
      bucketByDate.set(iso(cursor), index);
      cursor = shiftDays(cursor, 1);
    }
  });

  for (const row of ratings) {
    const index = bucketByDate.get(row.appeal_date);
    if (index !== undefined) buckets[index].ratings.push(row);
  }

  return buckets.map(({ from, to, ratings: grouped }) => ({
    from,
    to,
    voc: voc(grouped),
    count: grouped.length,
  }));
}

export function recommendedScale(period) {
  const days = Math.round((parseIso(period.to) - parseIso(period.from)) / DAY_MS) + 1;
  if (days <= 92) return 'day';
  if (days <= 366) return 'week';
  if (days <= 1096) return 'month';
  return 'quarter';
}
