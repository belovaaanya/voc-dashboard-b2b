import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const MAIN = read('site/js/main.js');
const DYNAMICS = read('site/js/blocks/dynamics.js');
const CSS = read('site/css/blocks.css');
const HTML = read('site/index.html');
const previousLineIsDotted = (css) => assert.match(css, /\.chart-line--previous\s*\{[^}]*stroke-dasharray/s);

test('DYN-1 Dynamics VOC SHOULD be a registered block renderer', () => {
  assert.match(MAIN, /import \{ renderDynamics \} from '\.\/blocks\/dynamics\.js';/);
  assert.match(MAIN, /id: 'dynamics'.*modifier: 'card--dynamics'.*render: renderDynamics/);
});

test('DYN-3 renderer SHOULD consume core series and plan functions instead of rating marks', () => {
  assert.match(DYNAMICS, /from '\.\.\/timeseries\.js'/);
  assert.match(DYNAMICS, /from '\.\.\/chart-geometry\.js'/);
  assert.match(DYNAMICS, /planForSlice/);
  assert.doesNotMatch(DYNAMICS, /\.mark\b|toFixed|Intl\.|toLocaleString/);
});

test('DYN-4/DYN-5 chart SHOULD use clipped own-SVG paths and a dotted previous line', () => {
  assert.match(DYNAMICS, /createElementNS/);
  assert.match(DYNAMICS, /clipPath/);
  assert.match(DYNAMICS, /chart-plot'.*'clip-path'/s);
  assert.match(DYNAMICS, /chart-line--above/);
  assert.match(DYNAMICS, /chart-line--in-plan/);
  assert.match(DYNAMICS, /chart-line--below/);
  previousLineIsDotted(CSS);
  assert.equal(/chart\.js|d3|highcharts|echarts/i.test(HTML), false);
});

test('DYN-5 positive control: a solid previous line MUST fail the visual contract', () => {
  const broken = CSS.replace(/\s*stroke-dasharray:\s*[^;]+;/, '');
  assert.throws(() => previousLineIsDotted(broken));
});

test('DYN-6 count layer SHOULD be a real pressed toggle with hover feedback', () => {
  assert.match(DYNAMICS, /setAttribute\('aria-pressed'/);
  assert.match(DYNAMICS, /showCounts = !showCounts/);
  assert.match(DYNAMICS, /chart-bars/);
  assert.match(CSS, /\.chart-toggle:hover/);
});

test('DYN-7 scale tabs SHOULD expose all Figma labels and selected state', () => {
  assert.match(DYNAMICS, /SCALE_OPTIONS/);
  assert.match(DYNAMICS, /setAttribute\('aria-selected'/);
  assert.match(CSS, /\.chart-scale__tab\[aria-selected='true'\]/);
});

test('DYN-9 points SHOULD expose hover and keyboard tooltip interactions', () => {
  assert.match(DYNAMICS, /setAttribute\('tabindex', '0'\)/);
  assert.match(DYNAMICS, /mouseenter/);
  assert.match(DYNAMICS, /focus/);
  assert.match(DYNAMICS, /aria-label/);
  assert.match(DYNAMICS, /chart-tooltip/);
  assert.match(DYNAMICS, /chart-point-label/);
});

test('DYN-10 series legend SHOULD stay in the right-hand Figma group', () => {
  assert.match(CSS, /\.chart-legend\s*\{[^}]*justify-content:\s*flex-end/s);
  assert.match(CSS, /\.chart-toggle\s*\{[^}]*margin-inline-end:\s*auto/s);
});
