import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const MAIN = read('site/js/main.js');
const CSS = read('site/css/blocks.css');

function assertSummaryRenderer(main) {
  assert.match(main, /import \{ renderConclusion \} from '\.\/blocks\/conclusion\.js';/);
  assert.match(main, /id: 'summary'.*modifier: 'card--summary'.*render: renderConclusion/);
}

function assertFigmaAccentComposition(source, css) {
  assert.match(source, /summary-row__factors/);
  assert.match(css, /\.summary-row__icon[^}]*color:\s*var\(--summary-accent\)[^}]*color-mix\([^;]*12%/s);
  assert.match(css, /\.summary-row__factors[^}]*color:\s*var\(--summary-accent\)/s);
}

test('SUM-4 summary placeholder SHOULD be replaced by a registered renderer', () => {
  assertSummaryRenderer(MAIN);
});

test('SUM-4 positive control: missing renderer MUST fail the registry guard', () => {
  assert.throws(() => assertSummaryRenderer(MAIN.replace(/render: renderConclusion/, 'render: missing')));
});

test('SUM-5 renderer SHOULD use the shared contribution methodology and labels', () => {
  const source = read('site/js/blocks/conclusion.js');
  assert.match(source, /buildConclusion/);
  assert.match(source, /DIMENSIONS/);
  assert.match(source, /context\.label/);
  assert.match(source, /formatImpact/);
  assert.doesNotMatch(source, /\.filter\(|\.reduce\(|\.mark\b|toFixed|Intl\.|toLocaleString/);
  assert.doesNotMatch(source, /АЗОН|Лояльност|Выписк|Платеж/);
});

test('SUM-6 Figma composition SHOULD expose AI marker, two signal tones and focus feedback', () => {
  const source = read('site/js/blocks/conclusion.js');
  assert.match(source, /Сделано с AI/);
  assert.match(source, /summaryRow\('positive'/);
  assert.match(source, /summaryRow\('negative'/);
  assert.match(CSS, /\.summary-row--positive/);
  assert.match(CSS, /\.summary-row--negative/);
  assert.match(source, /tabindex/);
  assert.match(source, /aria-label/);
  assert.match(CSS, /\.summary-row:hover/);
  assert.match(CSS, /\.summary-row:focus-visible/);
  assert.match(CSS, /\.summary-row__icon[^}]*width:\s*var\(--space-8\)[^}]*height:\s*var\(--space-8\)/s);
  assertFigmaAccentComposition(source, CSS);
});

test('SUM-6 positive control: solid accent tile MUST fail the Figma composition guard', () => {
  const source = read('site/js/blocks/conclusion.js');
  assert.throws(() => assertFigmaAccentComposition(source, CSS.replace('12%', '100%')));
});
