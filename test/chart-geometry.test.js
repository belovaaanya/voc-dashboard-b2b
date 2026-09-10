import { test } from 'node:test';
import assert from 'node:assert/strict';

import { areaPaths, chartDomain, linePaths, plotPoints } from '../site/js/chart-geometry.js';

test('DYN-8 chart domain SHOULD include current, previous and plan values', () => {
  assert.deepEqual(
    chartDomain(
      [{ voc: 4.72 }, { voc: 4.91 }],
      [{ voc: 4.65 }, { voc: 4.8 }],
      { min: 4.7, max: 4.85 },
    ),
    { min: 4.6, max: 4.95, ticks: [4.6, 4.65, 4.7, 4.75, 4.8, 4.85, 4.9, 4.95] },
  );
});

test('DYN-9 line path SHOULD break at an empty bucket', () => {
  const series = [{ voc: 4.7 }, { voc: null }, { voc: 4.8 }, { voc: 4.9 }];
  const points = plotPoints(series, { width: 300, height: 100, min: 4.6, max: 5 });
  const paths = linePaths(points);

  assert.equal(paths.length, 2);
  assert.match(paths[0], /^M /);
  assert.equal(paths[0].includes('C'), false);
  assert.match(paths[1], /^M .* C /);
  assert.equal(areaPaths(points, 100).length, 2);
  assert.match(areaPaths(points, 100)[1], / L 300 100 L 200 100 Z$/);
});

test('DYN-8 point coordinates SHOULD use the full plot area and keep missing values null', () => {
  assert.deepEqual(
    plotPoints([{ voc: 4 }, { voc: null }, { voc: 5 }], { width: 200, height: 100, min: 4, max: 5 }),
    [
      { index: 0, x: 0, y: 100, value: 4 },
      { index: 1, x: 100, y: null, value: null },
      { index: 2, x: 200, y: 0, value: 5 },
    ],
  );
});
