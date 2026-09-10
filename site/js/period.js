/**
 * Периоды дашборда: preset → диапазон дат и «предыдущий аналогичный» (`D-23`, `D-24`).
 *
 * Диапазон — включительно с обеих сторон, даты — ISO `YYYY-MM-DD` в UTC:
 * дашборд сравнивает календарные сутки, а не моменты времени.
 */

const MS_IN_DAY = 86400000;

export const PRESETS = [
  'month',
  'half-year',
  'calendar-year',
  'days-365',
  'years-5',
];

const ROLLING_DAYS = { 'days-365': 365 };

/** Границы календарного периода preset'а, внутрь которого попадает `date`. */
const CALENDAR_BOUNDS = {
  month: (year, month) => [[year, month, 1], [year, month + 1, 0]],
  'half-year': (year, month) =>
    month < 6 ? [[year, 0, 1], [year, 6, 0]] : [[year, 6, 1], [year, 12, 0]],
  'calendar-year': (year) => [[year, 0, 1], [year, 12, 0]],
  'years-5': (year) => [[year - 4, 0, 1], [year, 12, 0]],
};

/**
 * Сдвиг назад по `from`, а не по длине блока: `CALENDAR_BOUNDS` разворачивает
 * год в блок сам, поэтому для `years-5` шаг — год, а не пятилетие.
 */
const CALENDAR_STEP = {
  month: { months: 1 },
  'half-year': { months: 6 },
  'calendar-year': { months: 12 },
  'years-5': { months: 12 },
};

export function resolvePreset(preset, today) {
  const rollingDays = ROLLING_DAYS[preset];
  if (rollingDays) {
    return {
      preset,
      from: iso(shiftDays(parse(today), 1 - rollingDays)),
      to: normalize(today),
      complete: true,
    };
  }

  const bounds = CALENDAR_BOUNDS[preset];
  if (!bounds) throw new Error(`Неизвестный preset периода: ${preset}`);

  const date = parse(today);
  const [start, end] = bounds(date.getUTCFullYear(), date.getUTCMonth()).map(fromParts);
  const complete = date.getTime() >= end.getTime();

  return {
    preset,
    from: iso(start),
    to: iso(complete ? end : date),
    complete,
  };
}

export function customPeriod(from, to) {
  const start = normalize(from);
  const end = normalize(to);
  if (start > end) throw new Error(`Диапазон вывернут: ${from} … ${to}`);

  return { preset: 'custom', from: start, to: end, complete: true };
}

/**
 * Возвращает период той же формы, что `resolvePreset`: результат сам является
 * периодом, поэтому «май → апрель → март» — это повторный вызов, а не потеря
 * календарной семантики.
 */
export function previousPeriod(period) {
  const step = CALENDAR_STEP[period.preset];
  if (!step) return precedingRange(period);

  const previous = shiftCalendarBlock(period.preset, period.from, step.months);
  if (period.complete) {
    return { preset: period.preset, ...previous, complete: true };
  }

  // D-24: неполный период сравнивается с началом предыдущего, а не с ним целиком.
  const alignedTo = shiftDays(parse(previous.from), dayCount(period) - 1);
  const end = parse(previous.to);
  const coversWholeBlock = alignedTo.getTime() >= end.getTime();

  return {
    preset: period.preset,
    from: previous.from,
    to: iso(coversWholeBlock ? end : alignedTo),
    complete: coversWholeBlock,
  };
}

export function dayCount({ from, to }) {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / MS_IN_DAY) + 1;
}

function precedingRange(period) {
  const to = shiftDays(parse(period.from), -1);
  return {
    preset: period.preset,
    from: iso(shiftDays(to, 1 - dayCount(period))),
    to: iso(to),
    complete: true,
  };
}

function shiftCalendarBlock(preset, from, months) {
  const start = parse(from);
  const shifted = fromParts([
    start.getUTCFullYear(),
    start.getUTCMonth() - months,
    1,
  ]);
  const [previousStart, previousEnd] = CALENDAR_BOUNDS[preset](
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
  ).map(fromParts);

  return { from: iso(previousStart), to: iso(previousEnd) };
}

function parse(value) {
  const date = new Date(`${value}T00:00:00Z`);
  // `Date` докручивает 30 февраля до марта, поэтому мало проверить разбор.
  if (Number.isNaN(date.getTime()) || iso(date) !== value) {
    throw new Error(`Не дата: ${value}`);
  }
  return date;
}

function fromParts([year, month, day]) {
  return new Date(Date.UTC(year, month, day));
}

function shiftDays(date, days) {
  return new Date(date.getTime() + days * MS_IN_DAY);
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function normalize(value) {
  return iso(parse(value));
}
