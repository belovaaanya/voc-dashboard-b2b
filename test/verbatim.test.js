import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProblemCards,
  buildVerbatimRows,
  searchVerbatimRows,
} from '../site/js/verbatim.js';
import { rating } from './helpers/ratings.js';

const period = { from: '2026-05-01', to: '2026-05-02' };
const row = (id, date, problem, mark = 5, domain = 'Платежи') => rating({
  voc_ccode: id,
  appeal_date: date,
  problem,
  mark,
  domain,
});
const verbatim = (...pairs) => ({
  not_for_display: ['oslk_expertise_name'],
  items: Object.fromEntries(pairs.map(([id, comment]) => [id, {
    client_comment: comment,
    oslk_expertise_name: `Внутренняя экспертиза ${id}`,
  }])),
});

test('VB-2 frequent cards SHOULD rank problems by current share and keep a verbatim quote', () => {
  const previous = [row('P1', '2026-04-01', 'Платёж завис', 2), row('P2', '2026-04-02', 'Не приходит код', 3)];
  const current = [
    row('C1', '2026-05-01', 'Платёж завис', 1),
    row('C2', '2026-05-02', 'Платёж завис', 2),
    row('C3', '2026-05-02', 'Не приходит код', 4, 'Доступ'),
  ];
  const text = verbatim(
    ['C1', 'Платёж завис без объяснения причины.'],
    ['C2', 'Платёж всё ещё обрабатывается.'],
    ['C3', 'Код не приходит уже десять минут.'],
  );

  const cards = buildProblemCards(previous, current, period, text, 'frequent');

  assert.deepEqual(cards.map(({ key }) => key), ['Платёж завис', 'Не приходит код']);
  assert.ok(Math.abs(cards[0].currentShare - 200 / 3) < Number.EPSILON * 100);
  assert.equal(cards[0].quote, 'Платёж завис без объяснения причины.');
  assert.equal(cards[0].category, 'Платежи');
  assert.equal(cards[0].trend.length, 2);
  assert.deepEqual(cards[0].trend.map(({ share }) => share), [100, 50]);
  assert.ok(Number.isFinite(cards[0].impact));
});

test('VB-3 emerging cards SHOULD rank by latest mention, then by current share (D-44)', () => {
  const previous = [
    row('P1', '2026-04-01', 'Старая проблема'),
    row('P2', '2026-04-01', 'Старая проблема'),
    row('P3', '2026-04-01', 'Снижение'),
    row('P4', '2026-04-01', 'Снижение'),
  ];
  const current = [
    row('C1', '2026-05-02', 'Новая тема'),
    row('C2', '2026-05-01', 'Старая проблема'),
    row('C3', '2026-05-01', 'Старая проблема'),
    row('C4', '2026-05-01', 'Снижение'),
  ];
  const text = verbatim(
    ['C1', 'Новая тема появилась в этом месяце.'],
    ['C2', 'Старая проблема снова мешает работе.'],
    ['C3', 'Старая проблема всё ещё заметна.'],
    ['C4', 'Эта проблема встречается реже.'],
  );

  const cards = buildProblemCards(previous, current, period, text, 'emerging');

  assert.deepEqual(cards.map(({ key }) => key), ['Новая тема', 'Старая проблема', 'Снижение']);
  assert.equal(cards[0].lastSeen, '2026-05-02');
  assert.equal(cards[0].previousShare, 0);
  assert.equal(cards[0].shareDelta, 25);
});

test('VB-5 verbatim rows SHOULD join by voc_ccode without exposing not-for-display fields', () => {
  const rows = [
    rating({ voc_ccode: 'A', operations: ['Оплата', 'Подписание'], problem: 'Ошибка' }),
    rating({ voc_ccode: 'B', channel: 'НИБ', segment: 'СБ', problem: null }),
    rating({ voc_ccode: 'C', problem: 'Нет текста' }),
  ];
  const text = verbatim(['A', 'Платёж не подписывается.'], ['B', 'Не могу войти.']);

  const joined = buildVerbatimRows(rows, text);

  assert.equal(joined.length, 2);
  assert.deepEqual(joined[0], {
    vocCcode: 'A',
    date: '2026-05-01',
    channel: 'АБМ',
    segment: 'ММБ',
    trigger: 'Оплата · Подписание',
    category: 'Ошибка',
    rating: 5,
    comment: 'Платёж не подписывается.',
  });
  assert.equal(JSON.stringify(joined).includes('Внутренняя экспертиза'), false);
  assert.equal(Object.hasOwn(joined[0], 'oslk_expertise_name'), false);
});

test('VB-4 search SHOULD inspect every visible table field case-insensitively', () => {
  const rows = buildVerbatimRows(
    [
      rating({ voc_ccode: 'A', operations: ['Отправка платежа'], problem: 'Ошибка' }),
      rating({ voc_ccode: 'B', channel: 'НИБ', segment: 'СБ', operations: ['Вход'], problem: 'Доступ' }),
    ],
    verbatim(['A', 'Платёж завис.'], ['B', 'Не могу войти.']),
  );

  assert.deepEqual(searchVerbatimRows(rows, 'платЁж').map(({ vocCcode }) => vocCcode), ['A']);
  assert.deepEqual(searchVerbatimRows(rows, 'ниб').map(({ vocCcode }) => vocCcode), ['B']);
  assert.deepEqual(searchVerbatimRows(rows, '').map(({ vocCcode }) => vocCcode), ['A', 'B']);
});

test('VB-1 malformed verbatim payload SHOULD fail loudly instead of looking empty', () => {
  assert.throws(() => buildVerbatimRows([], []), /verbatim/);
  assert.throws(() => buildProblemCards([], [], period, { items: [] }, 'frequent'), /verbatim/);
});
