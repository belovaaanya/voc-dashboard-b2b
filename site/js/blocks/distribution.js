import { EMPTY } from '../block.js';
import { distributionForDisplay } from '../distribution.js';
import { element } from '../dom.js';
import { formatCount, formatShare } from '../format.js';

function ratingLabel(mark, count, share) {
  return `${mark} звёзд: ${formatShare(share)}, ${formatCount(count)} оценок`;
}

function distributionRow({ mark, count, share }) {
  const row = element('div', `distribution-row distribution-row--${mark}`);
  const label = ratingLabel(mark, count, share);
  row.setAttribute('tabindex', '0');
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', label);
  row.title = label;

  const track = element('span', 'distribution-row__track');
  const fill = element('span', 'distribution-row__fill');
  fill.style.setProperty('--distribution-share', `${share}%`);
  track.append(fill);

  row.append(
    element('span', 'distribution-row__mark', `${mark}★`),
    track,
    element('span', 'distribution-row__share', formatShare(share)),
  );
  return row;
}

export function renderDistribution(block, context) {
  block.setNote(null);
  if (context.slice.length === 0) {
    block.setState(EMPTY);
    return;
  }

  block.setNote(`${formatCount(context.slice.length)} оценок`);
  const chart = element('div', 'distribution');
  for (const bucket of distributionForDisplay(context.slice)) chart.append(distributionRow(bucket));
  block.setContent(chart);
}
