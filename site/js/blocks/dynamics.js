import { EMPTY } from '../block.js';
import { areaPaths, chartDomain, linePaths, plotPoints } from '../chart-geometry.js';
import { element } from '../dom.js';
import { formatCount, formatDate, formatDateRange, formatVoc } from '../format.js';
import { planForSlice } from '../plan.js';
import { roundVoc } from '../round.js';
import { SCALE_OPTIONS, buildTimeSeries, recommendedScale } from '../timeseries.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWBOX = { width: 1002, height: 222 };
const PLOT = { x: 44, y: 4, width: 946, height: 184 };

let selectedScale = null;
let showCounts = true;
let chartSequence = 0;

function svgNode(tag, className, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute('class', className);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function svgText(className, text, attributes) {
  const node = svgNode('text', className, attributes);
  node.textContent = text;
  return node;
}

function periodLabel(period) {
  const label = element('span', 'chart-period', formatDateRange(period.from, period.to));
  label.setAttribute('aria-label', `Период графика: ${formatDateRange(period.from, period.to)}`);
  return label;
}

function scaleTabs(block, context, scale) {
  const tabs = element('span', 'chart-scale');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Масштаб графика');

  for (const option of SCALE_OPTIONS) {
    const tab = element('button', 'chart-scale__tab', option.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(option.value === scale));
    tab.addEventListener('click', () => {
      selectedScale = option.value;
      renderDynamics(block, context);
    });
    tabs.append(tab);
  }
  return tabs;
}

function expandButton(block) {
  const expanded = block.element.classList.contains('is-expanded');
  const button = element('button', 'chart-expand', expanded ? '↙' : '↗');
  button.type = 'button';
  button.setAttribute('aria-label', expanded ? 'Свернуть график' : 'Развернуть график');
  button.setAttribute('aria-pressed', String(expanded));
  button.addEventListener('click', () => {
    block.element.classList.toggle('is-expanded');
    const next = block.element.classList.contains('is-expanded');
    button.textContent = next ? '↙' : '↗';
    button.setAttribute('aria-label', next ? 'Свернуть график' : 'Развернуть график');
    button.setAttribute('aria-pressed', String(next));
  });
  return button;
}

function headerControls(block, context, scale) {
  const controls = element('span', 'chart-controls');
  controls.append(periodLabel(context.period), scaleTabs(block, context, scale), expandButton(block));
  return controls;
}

function shownSeries(ratings, period, scale) {
  return buildTimeSeries(ratings, period, scale).map((point) => ({
    ...point,
    voc: roundVoc(point.voc),
  }));
}

function yPosition(value, domain) {
  return PLOT.height - ((value - domain.min) / (domain.max - domain.min)) * PLOT.height;
}

function appendClip(defs, id, y, height) {
  const clip = svgNode('clipPath', null, { id });
  clip.append(svgNode('rect', null, { x: 0, y, width: PLOT.width, height: Math.max(0, height) }));
  defs.append(clip);
}

function appendGrid(svg, domain) {
  const grid = svgNode('g', 'chart-grid', { transform: `translate(${PLOT.x} ${PLOT.y})` });
  for (const tick of domain.ticks) {
    const y = yPosition(tick, domain);
    grid.append(svgNode('line', null, { x1: 0, y1: y, x2: PLOT.width, y2: y }));
    svg.append(svgText('chart-axis-label chart-axis-label--y', formatVoc(tick), { x: 0, y: PLOT.y + y + 3 }));
  }
  svg.append(grid);
}

function labelIndices(length, limit = 7) {
  if (length <= limit) return Array.from({ length }, (_, index) => index);
  return [...new Set(Array.from({ length: limit }, (_, index) => Math.round((index * (length - 1)) / (limit - 1))))];
}

function bucketLabel(bucket) {
  return bucket.from === bucket.to ? formatDate(bucket.from) : formatDateRange(bucket.from, bucket.to);
}

function appendXAxis(svg, series, points) {
  const labels = svgNode('g', 'chart-axis chart-axis--x', { transform: `translate(${PLOT.x} 0)` });
  for (const index of labelIndices(series.length)) {
    labels.append(
      svgText('chart-axis-label', formatDate(series[index].from), {
        x: points[index].x,
        y: VIEWBOX.height - 4,
        'text-anchor': index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle',
      }),
    );
  }
  svg.append(labels);
}

function appendBars(plot, series, points) {
  const maxCount = Math.max(...series.map(({ count }) => count), 1);
  const width = Math.max(2, Math.min(18, (PLOT.width / Math.max(series.length, 1)) * 0.55));
  const bars = svgNode('g', 'chart-bars');
  series.forEach((bucket, index) => {
    if (!bucket.count) return;
    const height = (bucket.count / maxCount) * PLOT.height * 0.34;
    bars.append(
      svgNode('rect', 'chart-bar', {
        x: points[index].x - width / 2,
        y: PLOT.height - height,
        width,
        height,
        rx: Math.min(2, width / 2),
      }),
    );
  });
  plot.append(bars);
}

function appendPathGroup(plot, paths, className, clipId = null) {
  const group = svgNode('g', null, clipId ? { 'clip-path': `url(#${clipId})` } : {});
  for (const path of paths) group.append(svgNode('path', className, { d: path }));
  plot.append(group);
}

function appendPlanLayers(plot, defs, currentPaths, currentAreas, plan, domain, ids) {
  if (!plan) {
    appendPathGroup(plot, currentAreas, 'chart-area chart-area--default');
    appendPathGroup(plot, currentPaths, 'chart-line chart-line--default');
    return;
  }

  const top = yPosition(plan.max, domain);
  const bottom = yPosition(plan.min, domain);
  plot.append(svgNode('rect', 'chart-plan-band', { x: 0, y: top, width: PLOT.width, height: bottom - top }));

  appendClip(defs, ids.above, 0, top);
  appendClip(defs, ids.inPlan, top, bottom - top);
  appendClip(defs, ids.below, bottom, PLOT.height - bottom);

  appendPathGroup(plot, currentAreas, 'chart-area chart-area--above', ids.above);
  appendPathGroup(plot, currentAreas, 'chart-area chart-area--below', ids.below);
  appendPathGroup(plot, currentPaths, 'chart-line chart-line--above', ids.above);
  appendPathGroup(plot, currentPaths, 'chart-line chart-line--in-plan', ids.inPlan);
  appendPathGroup(plot, currentPaths, 'chart-line chart-line--below', ids.below);
}

function showTooltip(tooltip, bucket, point) {
  tooltip.textContent = `${bucketLabel(bucket)} · VOC ${formatVoc(bucket.voc)} · ${formatCount(bucket.count)} оценок`;
  tooltip.style.setProperty('--tooltip-x', `${((PLOT.x + point.x) / VIEWBOX.width) * 100}%`);
  tooltip.style.setProperty('--tooltip-y', `${((PLOT.y + point.y) / VIEWBOX.height) * 100}%`);
  tooltip.hidden = false;
}

function pointTone(value, plan) {
  if (!plan) return 'default';
  if (value > plan.max) return 'above';
  if (value < plan.min) return 'below';
  return 'in-plan';
}

function appendPointLabels(plot, series, points, plan) {
  const labels = svgNode('g', 'chart-point-labels', { 'aria-hidden': 'true' });
  const visible = new Set(labelIndices(series.length, 20));
  series.forEach((bucket, index) => {
    const point = points[index];
    if (point.y === null || !visible.has(index)) return;
    const tone = pointTone(bucket.voc, plan);
    const below = tone === 'below' && point.y <= PLOT.height - 16;
    labels.append(
      svgText(`chart-point-label chart-point-label--${tone}`, formatVoc(bucket.voc), {
        x: point.x,
        y: Math.max(10, Math.min(PLOT.height - 2, point.y + (below ? 14 : -8))),
        'text-anchor': index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle',
      }),
    );
  });
  plot.append(labels);
}

function appendPoints(plot, series, points, tooltip, plan) {
  const group = svgNode('g', 'chart-points');
  series.forEach((bucket, index) => {
    const point = points[index];
    if (point.y === null) return;
    const circle = svgNode('circle', `chart-point chart-point--${pointTone(bucket.voc, plan)}`, {
      cx: point.x,
      cy: point.y,
      r: 4,
    });
    circle.setAttribute('tabindex', '0');
    circle.setAttribute('role', 'button');
    circle.setAttribute(
      'aria-label',
      `${bucketLabel(bucket)}: VOC ${formatVoc(bucket.voc)}, ${formatCount(bucket.count)} оценок`,
    );
    const reveal = () => showTooltip(tooltip, bucket, point);
    circle.addEventListener('mouseenter', reveal);
    circle.addEventListener('focus', reveal);
    circle.addEventListener('click', reveal);
    circle.addEventListener('mouseleave', () => {
      if (document.activeElement !== circle) tooltip.hidden = true;
    });
    circle.addEventListener('blur', () => {
      tooltip.hidden = true;
    });
    group.append(circle);
  });
  plot.append(group);
}

function legendItem(className, text) {
  const item = element('span', 'chart-legend__item');
  item.append(element('span', `chart-legend__key ${className}`), element('span', null, text));
  return item;
}

function chartLegend(block, context, plan, hasPrevious) {
  const legend = element('div', 'chart-legend');
  const counts = element('button', 'chart-toggle', `Оценки: ${formatCount(context.slice.length)}`);
  counts.type = 'button';
  counts.setAttribute('aria-pressed', String(showCounts));
  counts.addEventListener('click', () => {
    showCounts = !showCounts;
    renderDynamics(block, context);
  });
  legend.append(counts);
  legend.append(legendItem('chart-legend__key--voc', 'VOC'));
  if (plan) legend.append(legendItem('chart-legend__key--plan', 'План'));
  if (hasPrevious) legend.append(legendItem('chart-legend__key--previous', 'Прошлый период'));
  return legend;
}

function renderChart(block, context, scale, plan) {
  const current = shownSeries(context.slice, context.period, scale);
  const previous = shownSeries(context.previousSlice, context.previousPeriod, scale);
  const hasPrevious = previous.some(({ voc }) => voc !== null);
  const shownPlan = plan ? { ...plan, min: roundVoc(plan.min), max: roundVoc(plan.max) } : null;
  const domain = chartDomain(current, previous, shownPlan);
  const currentPoints = plotPoints(current, { width: PLOT.width, height: PLOT.height, ...domain });
  const previousPoints = plotPoints(previous, { width: PLOT.width, height: PLOT.height, ...domain });
  const currentPaths = linePaths(currentPoints);
  const currentAreas = areaPaths(currentPoints, PLOT.height);

  const chart = element('div', 'chart');
  chart.append(chartLegend(block, context, shownPlan, hasPrevious));
  const stage = element('div', 'chart-stage');
  const tooltip = element('div', 'chart-tooltip');
  tooltip.hidden = true;

  const svg = svgNode('svg', 'chart-svg', {
    viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
    role: 'img',
    'aria-label': `Динамика VOC за ${formatDateRange(context.period.from, context.period.to)}`,
  });
  svg.append(svgNode('title', null));
  svg.firstChild.textContent = 'Динамика VOC, план, предыдущий период и количество оценок';
  appendGrid(svg, domain);
  appendXAxis(svg, current, currentPoints);

  const defs = svgNode('defs');
  const prefix = `dynamics-${chartSequence += 1}`;
  const ids = {
    plot: `${prefix}-plot`,
    above: `${prefix}-above`,
    inPlan: `${prefix}-plan`,
    below: `${prefix}-below`,
  };
  appendClip(defs, ids.plot, 0, PLOT.height);
  const plot = svgNode('g', 'chart-plot', {
    transform: `translate(${PLOT.x} ${PLOT.y})`,
    'clip-path': `url(#${ids.plot})`,
  });
  if (showCounts) appendBars(plot, current, currentPoints);
  if (hasPrevious) appendPathGroup(plot, linePaths(previousPoints), 'chart-line chart-line--previous');
  appendPlanLayers(plot, defs, currentPaths, currentAreas, shownPlan, domain, ids);
  appendPointLabels(plot, current, currentPoints, shownPlan);
  appendPoints(plot, current, currentPoints, tooltip, shownPlan);
  svg.append(defs, plot);
  stage.append(svg, tooltip);
  chart.append(stage);
  return chart;
}

export function renderDynamics(block, context) {
  block.setTitle('Динамика VOC');
  if (context.slice.length === 0) {
    block.setNote(null);
    block.setState(EMPTY);
    return;
  }

  const scale = selectedScale ?? recommendedScale(context.period);
  const plan = planForSlice(context.reference?.plan, {
    channel: context.state.channel,
    from: context.period.from,
    to: context.period.to,
    filters: context.state.filters,
  });
  block.setNote(headerControls(block, context, scale));
  block.setContent(renderChart(block, context, scale, plan));
}
