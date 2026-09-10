/**
 * Контракт блока — docs/ui-shell.md. Блоки следующих слайсов пишутся
 * параллельно, поэтому проверяется не поведение карточек, а сам интерфейс:
 * реестр, состав контекста и границы, которые блоку нельзя переходить.
 *
 * Проверки статические: `main.js` и `blocks/*` трогают DOM, а ядро — нет,
 * и тянуть сюда браузер ради формы реестра было бы дороже пользы.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const MAIN = read('site/js/main.js');
const CONTRACT_DOC = read('docs/ui-shell.md');

const BLOCK_FILES = readdirSync(fileURLToPath(new URL('site/js/blocks/', root)));

/** Строки реестра BLOCKS: одна запись — одна строка, ради тривиального merge. */
const REGISTRY_ROWS = MAIN.slice(MAIN.indexOf('const BLOCKS = ['), MAIN.indexOf('];'))
  .split('\n')
  .filter((line) => line.trim().startsWith('{ id:'));

const REQUIRED_CONTEXT_KEYS = [
  'rows',
  'slice',
  'previousSlice',
  'state',
  'period',
  'previousPeriod',
  'reference',
  'label',
  'dimensions',
  'select',
  'setState',
  'verbatim',
  'requestVerbatim',
];

test('AC-1 каждая запись реестра с рендерером ссылается на существующий модуль blocks/', () => {
  const imported = [...MAIN.matchAll(/from '\.\/blocks\/([\w-]+\.js)'/g)].map((m) => m[1]);

  assert.ok(imported.length > 0, 'main.js не импортирует ни одного блока');
  for (const file of imported) {
    assert.ok(BLOCK_FILES.includes(file), `в site/js/blocks/ нет модуля ${file}`);
  }
});

/* metrics.js исключён намеренно: groupBy нужен каркасу для порядка сегментных карточек */
test('AC-1 каркас не считает метрики сам: расчётные модули нужны блокам, а не main.js', () => {
  for (const module of ['sufficiency', 'plan', 'impact', 'breakdown']) {
    assert.equal(
      new RegExp(`from '\\./${module}\\.js'`).test(MAIN),
      false,
      `main.js импортирует ${module}.js — расчёт уехал в каркас`,
    );
  }
});

test('AC-6 выборка global/local period живёт в selection.js, а не дублируется в каркасе', () => {
  assert.match(MAIN, /import \{ createSelector \} from '\.\/selection\.js';/);
  assert.doesNotMatch(MAIN, /function (matchesFilters|sliceRows)\b/);
});

test('AC-3 контекст несёт все обязательные поля контракта', () => {
  const literal = MAIN.slice(MAIN.indexOf('const context = {'), MAIN.indexOf('};', MAIN.indexOf('const context = {')));

  for (const key of REQUIRED_CONTEXT_KEYS) {
    assert.match(literal, new RegExp(`\\b${key}\\b`), `в объекте контекста нет поля ${key}`);
  }
});

test('AC-5 состав контекста описан в docs/ui-shell.md — документация не расходится с кодом', () => {
  for (const key of REQUIRED_CONTEXT_KEYS) {
    assert.match(
      CONTRACT_DOC,
      new RegExp(`\\|\\s*\`${key}\``),
      `поле контекста ${key} не описано в таблице контракта ui-shell.md`,
    );
  }
});

test('AC-6 результат select документирует effective local period и его сравнение', () => {
  assert.match(
    CONTRACT_DOC,
    /`select` \| `\(overrides\) => \{ rows, previous, period, previousPeriod \}`/,
  );
});

test('AC-4 реестр — плоский список по строке на блок: добавление блока не трогает соседей', () => {
  assert.ok(REGISTRY_ROWS.length >= 7, `в реестре ${REGISTRY_ROWS.length} строк, ожидалось не меньше семи`);
  for (const row of REGISTRY_ROWS) {
    assert.match(row, /^\s*\{ id: '[\w-]+'.*\},$/, `запись реестра не умещается в одну строку: ${row.trim()}`);
  }
});

test('AC-19 вторая строка метрик — только считаемое из выгрузки (D-15)', () => {
  for (const title of ['Оценок', 'Низких оценок', 'Доля 5★']) {
    assert.match(MAIN, new RegExp(`title: '${title}'`), `в реестре нет карточки «${title}»`);
  }
  for (const absent of ['Стабильность', 'Конверсия в опрос', 'Покрытие']) {
    assert.equal(MAIN.includes(absent), false, `в реестре есть «${absent}», у которой нет источника`);
  }
});

/** Своё форматирование в блоке (`D-20`). */
function formattingOffences(source) {
  return ['toLocaleString', 'Intl.', 'toFixed'].filter((token) => source.includes(token));
}

/**
 * Расчёт, продублированный в блоке: обращение к `mark` и деление на длину
 * среза — те два способа, которыми VOC переписывают на месте.
 */
function arithmeticOffences(source) {
  const checks = [
    ['обращение к mark', /\.mark\b/],
    ['деление на длину среза', /\/\s*\w*([Rr]atings|rows|slice)\.length/],
  ];
  return checks.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

/* Исходник, нарушающий обе границы: на нём обе проверки обязаны срабатывать */
const OFFENDER = 'const value = rows.reduce((sum, r) => sum + r.mark, 0) / rows.length;\nvalue.toFixed(2);';

test('AC-26 блоки не форматируют мимо format.js (D-20)', () => {
  for (const file of BLOCK_FILES) {
    assert.deepEqual(formattingOffences(read(`site/js/blocks/${file}`)), [], `${file} форматирует сам`);
  }
});

test('AC-27 блоки не считают VOC сами: ни деления на длину среза, ни суммы по mark', () => {
  for (const file of BLOCK_FILES) {
    assert.deepEqual(arithmeticOffences(read(`site/js/blocks/${file}`)), [], `${file} считает на месте`);
  }
});

/* Positive control: обе проверки прогоняются тем же кодом по заведомо нарушающему исходнику */
test('AC-26/AC-27 positive control: нарушающий исходник обязан быть пойман обеими проверками', () => {
  assert.deepEqual(formattingOffences(OFFENDER), ['toFixed']);
  assert.deepEqual(arithmeticOffences(OFFENDER), ['обращение к mark', 'деление на длину среза']);
});
