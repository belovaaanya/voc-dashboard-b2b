import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const MAIN = read('site/js/main.js');
const HTML = read('site/index.html');
const CSS = read('site/css/blocks.css');

function assertDetailColumns(source) {
  assert.match(source, /\['Дата', 'Канал', 'Сегмент', 'Триггер', 'Категория', 'Оценка', 'Комментарий'\]/);
  assert.doesNotMatch(source, /ФО|Платформа|X-pin|U-pin|УИУКО|oslk_expertise_name/);
}

function assertFigmaComposition(source, css) {
  assert.match(source, /Частотные/);
  assert.match(source, /Новые/);
  assert.match(source, /Сделано с AI/);
  assert.match(source, /role', 'tablist'/);
  assert.match(source, /aria-selected/);
  assert.match(css, /\.verbatim-cards[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(161px,/s);
  assert.match(css, /\.verbatim-card[^}]*min-height:\s*var\(--verbatim-card-height\)/s);
  assert.match(css, /\.verbatim-card:hover/);
  assert.match(css, /\.verbatim-card:focus-visible/);
  assert.match(css, /\.card--verbatim-table[^}]*min-height:\s*var\(--verbatim-table-height\)/s);
}

test('VB-1 main SHOULD expose one lazy verbatim provider to both registered blocks', () => {
  assert.match(MAIN, /loadVerbatim as loadVerbatimFile/);
  assert.match(MAIN, /verbatimPromise \?\?=/);
  assert.match(MAIN, /\bverbatim\b/);
  assert.match(MAIN, /\brequestVerbatim\b/);
  assert.match(MAIN, /id: 'verbatim-cards'.*render: renderVerbatimCards/);
  assert.match(MAIN, /id: 'verbatim-table'.*host: 'full'.*render: renderVerbatimTable/);
  assert.match(HTML, /id="full"/);
});

test('VB-2/VB-4 renderers SHOULD use the shared verbatim core and shared formatting', () => {
  const cards = read('site/js/blocks/verbatim-cards.js');
  const table = read('site/js/blocks/verbatim-table.js');
  assert.match(cards, /buildProblemCards/);
  assert.match(cards, /formatShare/);
  assert.match(cards, /formatImpact/);
  assert.match(table, /buildVerbatimRows/);
  assert.match(table, /searchVerbatimRows/);
  assert.match(table, /formatDate/);
  assert.doesNotMatch(cards + table, /toFixed|toLocaleString|Intl\.|\.mark\b/);
});

test('VB-4 detail table SHOULD expose exactly the source-backed D-17 columns', () => {
  assertDetailColumns(read('site/js/blocks/verbatim-table.js'));
});

test('VB-4 positive control: adding a source-less column MUST fail D-17 guard', () => {
  const source = read('site/js/blocks/verbatim-table.js');
  assert.throws(() => assertDetailColumns(source.replace("'Комментарий'", "'Платформа', 'Комментарий'")));
});

test('VB-6 cards and table SHOULD preserve the measured Figma composition', () => {
  assertFigmaComposition(read('site/js/blocks/verbatim-cards.js'), CSS);
});

test('VB-6 positive control: four cards per row MUST fail the Figma guard', () => {
  const source = read('site/js/blocks/verbatim-cards.js');
  assert.throws(() => assertFigmaComposition(source, CSS.replace('repeat(5,', 'repeat(4,')));
});
