/**
 * Наборы оценок для тестов — строятся руками, маленькими, под конкретный инвариант.
 * Форма строки — `docs/data-model.md` §7.
 */

let sequence = 0;

export function rating(overrides = {}) {
  sequence += 1;
  return {
    voc_ccode: `T-${sequence}`,
    appeal_date: '2026-05-01',
    channel: 'АБМ',
    segment: 'ММБ',
    mark: 5,
    domain: 'Платежи',
    problem_type: null,
    problem: null,
    operations: ['Отправка платежа'],
    ...overrides,
  };
}

export function ratingsWithMarks(marks, overrides = {}) {
  return marks.map((mark) => rating({ mark, ...overrides }));
}
