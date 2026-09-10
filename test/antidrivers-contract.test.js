import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const MAIN = read('site/js/main.js');
const CSS = read('site/css/blocks.css');

function assertThreeStopHeatmap(css) {
  assert.match(css, /\.heatmap-cell--bad[^}]*var\(--color-scale-bad\)/s);
  assert.match(css, /\.heatmap-cell--mid[^}]*var\(--color-scale-mid\)/s);
  assert.match(css, /\.heatmap-cell--good[^}]*var\(--color-scale-good\)/s);
}

test('ANTI-5 antidrivers SHOULD be a registered renderer', () => {
  assert.match(MAIN, /renderAntidrivers/);
  assert.match(MAIN, /id: 'antidrivers'.*modifier: 'card--antidrivers'.*render: renderAntidrivers/);
});

test('ANTI-6 renderer SHOULD use the existing impact, dimension and timeseries contracts', () => {
  const source = read('site/js/blocks/antidrivers.js');
  assert.match(source, /rankAntidrivers/);
  assert.match(source, /buildHeatmap/);
  assert.match(source, /DIMENSIONS/);
  assert.match(source, /recommendedScale/);
  assert.doesNotMatch(source, /\.mark\b|toFixed|Intl\.|toLocaleString/);
});

test('ANTI-7 only supported antidriver dimensions SHOULD be exposed', () => {
  const source = read('site/js/blocks/antidrivers.js');
  for (const key of ['product', 'trigger', 'cp', 'domain']) assert.match(source, new RegExp(`'${key}'`));
  const configuredKeys = source.match(/DIMENSION_KEYS\s*=\s*\[([^\]]+)\]/)?.[1] ?? '';
  assert.doesNotMatch(configuredKeys, /role|Роли/i);
});

test('ANTI-8 ranking and heatmap SHOULD expose selected, hover and keyboard states', () => {
  const source = read('site/js/blocks/antidrivers.js');
  assert.match(source, /aria-selected/);
  assert.match(source, /antidriver-row/);
  assert.match(source, /heatmap-cell/);
  assert.match(source, /tabindex/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-controls/);
  assert.match(source, /aria-selected/);
  assert.match(source, /querySelector\('\.heatmap tr\.is-focused \.heatmap-cell'\)\?\.focus\(\)/);
  assert.match(CSS, /\.antidriver-row:hover/);
  assert.match(CSS, /\.heatmap-cell:focus/);
  assert.match(source, /упоминаний/);
  assert.doesNotMatch(source, /cell\.mentions\)} оценок/);
});

test('ANTI-9 heatmap SHOULD use the three-stop palette and real overflow', () => {
  assertThreeStopHeatmap(CSS);
  assert.match(CSS, /\.heatmap-scroll\s*\{[^}]*overflow-x:\s*auto/s);
});

test('ANTI-9 positive control: guard MUST reject a heatmap without the middle stop', () => {
  const broken = CSS.replace('var(--color-scale-mid)', 'var(--color-scale-good)');
  assert.throws(() => assertThreeStopHeatmap(broken));
});

test('ANTI-10 ranking MUST be the default first level required by V-29', () => {
  const source = read('site/js/blocks/antidrivers.js');
  assert.match(source, /selectedAntidriverView = 'ranking'/);
  assert.equal(/chart\.js|d3|highcharts|echarts/i.test(read('site/index.html')), false);
});
