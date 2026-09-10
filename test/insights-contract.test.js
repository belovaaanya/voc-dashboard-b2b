import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const MAIN = read('site/js/main.js');
const DYNAMICS = read('site/js/blocks/dynamics.js');
const ANTIDRIVERS = read('site/js/blocks/antidrivers.js');
const CSS = read('site/css/blocks.css');

function assertLinkedSelection(main, dynamics, antidrivers) {
  assert.match(main, /focus/);
  assert.match(dynamics, /state\.focus/);
  assert.match(dynamics, /context\.setState\(\{ \.\.\.context\.state, focus \}\)/);
  assert.match(antidrivers, /state\.focus/);
  assert.match(antidrivers, /select\(\{\s*from:\s*focus,\s*to:\s*focus\s*\}\)/s);
  assert.match(antidrivers, /previousDateForFocus/);
}

test('INS-5 Insights SHOULD be registered as a real renderer', () => {
  assert.match(MAIN, /import \{ renderInsights \} from '\.\/blocks\/insights\.js';/);
  assert.match(MAIN, /id: 'insights'.*modifier: 'card--insights'.*render: renderInsights/);
});

test('INS-6 graph, antidrivers and insights SHOULD share one URL-backed focused date', () => {
  assertLinkedSelection(MAIN, DYNAMICS, ANTIDRIVERS);
  const source = read('site/js/blocks/insights.js');
  assert.match(source, /state\.focus/);
  assert.match(source, /setState/);
  assert.match(source, /aria-pressed/);
});

test('INS-6 positive control: missing graph state update MUST fail the link guard', () => {
  const broken = DYNAMICS.replace(/context\.setState/g, 'noop');
  assert.throws(() => assertLinkedSelection(MAIN, broken, ANTIDRIVERS));
});

test('INS-7 rows SHOULD expose Figma content and interactive states without fake events (D-16, V-30)', () => {
  const source = read('site/js/blocks/insights.js');
  assert.match(source, /Инсайты/);
  assert.match(source, /Сделано с AI/);
  assert.match(source, /formatDate/);
  assert.match(source, /formatDelta/);
  assert.match(source, /formatVoc/);
  assert.match(source, /cause/);
  assert.match(source, /aria-pressed/);
  assert.match(CSS, /\.insight-row:hover/);
  assert.match(CSS, /\.insight-row:focus-visible/);
  assert.doesNotMatch(source, /Сбой|релиз|авари/i);
});

test('INS-8 anomalies MUST remain a kind inside Insights, not a separate block (D-16)', () => {
  const source = read('site/js/blocks/insights.js');
  assert.doesNotMatch(MAIN, /id: ['"]anomal/);
  assert.doesNotMatch(source, /setTitle\(['"]Аномали/);
});

test('INS-9 Figma rail SHOULD use compact rows and page growth instead of an internal vertical scrollbar', () => {
  assert.match(CSS, /\.card--insights/);
  assert.match(CSS, /\.insight-row/);
  assert.doesNotMatch(CSS, /\.insight-list\s*\{[^}]*overflow-y\s*:/s);
});

test('INS-10 keyboard activation SHOULD restore focus after the synchronous dashboard rerender', () => {
  const source = read('site/js/blocks/insights.js');
  assert.match(DYNAMICS, /data-focus-date/);
  assert.match(DYNAMICS, /querySelector\([^)]*data-focus-date[^)]*\)\?\.focus\(\)/s);
  assert.match(source, /data-focus-date/);
  assert.match(source, /querySelector\([^)]*data-focus-date[^)]*\)\?\.focus\(\)/s);
});

test('INS-11 canonical URL SHOULD remove a rejected or out-of-period focus value', () => {
  assert.match(MAIN, /window\.location\.search/);
  assert.match(MAIN, /toSearch\(state\).*currentLocation/s);
  assert.match(MAIN, /syncState\(state\)/);
});
