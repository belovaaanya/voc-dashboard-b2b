import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const MAIN = read('site/js/main.js');
const CSS = read('site/css/blocks.css');

function assertRegisteredRenderer(main) {
  assert.match(main, /import \{ renderDistribution \} from '\.\/blocks\/distribution\.js';/);
  assert.match(main, /id: 'distribution'.*host: 'rail-top'.*modifier: 'card--distribution'.*render: renderDistribution/);
}

test('DIST-3 distribution SHOULD be a registered renderer in the upper rail', () => {
  assertRegisteredRenderer(MAIN);
});

test('DIST-3 positive control: missing renderer MUST fail the registry guard', () => {
  assert.throws(() => assertRegisteredRenderer(MAIN.replace(/render: renderDistribution/, 'render: missing')));
});

test('DIST-4 renderer SHOULD use core calculation and shared formatting', () => {
  const source = read('site/js/blocks/distribution.js');
  assert.match(source, /distributionForDisplay/);
  assert.match(source, /formatCount/);
  assert.match(source, /formatShare/);
  assert.doesNotMatch(source, /\.filter\(|\.reduce\(|toFixed|Intl\.|toLocaleString/);
  assert.doesNotMatch(source, /\b(?:5|7|10|25|53)\s*%/);
});

test('DIST-5 rows SHOULD expose data-backed hover and keyboard focus states', () => {
  const source = read('site/js/blocks/distribution.js');
  assert.match(source, /tabindex/);
  assert.match(source, /aria-label/);
  assert.match(source, /\.title\s*=/);
  assert.match(source, /--distribution-share/);
  assert.match(CSS, /\.distribution-row:hover/);
  assert.match(CSS, /\.distribution-row:focus-visible/);
});

test('DIST-6 distribution SHOULD not add a chart dependency', () => {
  assert.equal(/chart\.js|d3|highcharts|echarts/i.test(read('site/index.html')), false);
});
