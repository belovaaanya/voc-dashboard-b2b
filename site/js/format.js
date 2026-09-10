/*
  Единственный модуль форматирования на весь дашборд (D-20).
  Считаем в полной точности, округляем только при выводе (D-21).
*/

const NBSP = ' ';

const formatters = new Map();

function formatter(digits) {
  let cached = formatters.get(digits);
  if (!cached) {
    cached = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: true,
    });
    formatters.set(digits, cached);
  }
  return cached;
}

/* Часть сборок ICU группирует ru-RU разряды узким пробелом U+202F — приводим к NBSP */
function withNbsp(text) {
  return text.replace(/[\s  ]/g, NBSP);
}

export function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return withNbsp(formatter(digits).format(value));
}

export function formatVoc(value) {
  return formatNumber(value, 2);
}

export function formatDelta(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + formatNumber(value, 2);
}

export function formatDeltaCount(value) {
  if (!Number.isFinite(value)) return '—';
  return (value > 0 ? '+' : '') + formatNumber(value, 0);
}

export function formatDeltaShare(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${formatNumber(value, 1)}${NBSP}п.${NBSP}п.`;
}

export function formatImpact(value) {
  return formatNumber(value, 3);
}

export function formatCount(value) {
  return formatNumber(value, 0);
}

/* Доли — один знак после запятой (D-40); пробел перед знаком процента неразрывный */
export function formatShare(value) {
  if (!Number.isFinite(value)) return '—';
  return `${formatNumber(value, 1)}${NBSP}%`;
}

/*
  Даты разбираем по частям строки: new Date('2026-05-12') — UTC-полночь, и в
  часовом поясе западнее Гринвича toLocale* отдаёт предыдущий день
*/
function parseIsoDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!match) return null;
  const [, year, month, day] = match;
  return { year, month, day };
}

export function formatDate(iso) {
  const parts = parseIsoDate(iso);
  if (!parts) return '—';
  return `${parts.day}.${parts.month}.${parts.year.slice(2)}`;
}

export function formatDateRange(from, to) {
  if (!from && !to) return '—';
  return `${formatDate(from)} - ${formatDate(to)}`;
}

export function formatBuildTime(isoTimestamp) {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${pad(parsed.getDate())}.${pad(parsed.getMonth() + 1)}.${String(parsed.getFullYear()).slice(2)}`;
  return `${date}, ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}
