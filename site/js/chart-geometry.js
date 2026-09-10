const STEP = 0.05;

function shown(value) {
  return Math.round(value * 100) / 100;
}

export function chartDomain(current, previous = [], plan = null) {
  const values = [...current, ...previous]
    .map(({ voc }) => voc)
    .filter((value) => Number.isFinite(value));
  if (Number.isFinite(plan?.min)) values.push(plan.min);
  if (Number.isFinite(plan?.max)) values.push(plan.max);
  if (!values.length) return { min: 1, max: 5, ticks: [1, 2, 3, 4, 5] };

  let min = Math.max(1, Math.floor((Math.min(...values) - 0.02) / STEP) * STEP);
  let max = Math.min(5, Math.ceil((Math.max(...values) + 0.02) / STEP) * STEP);
  if (max - min < 0.2) {
    min = Math.max(1, min - STEP);
    max = Math.min(5, max + STEP);
  }
  min = shown(min);
  max = shown(max);

  const ticks = [];
  for (let value = min; value <= max + STEP / 2; value += STEP) ticks.push(shown(value));
  return { min, max, ticks };
}

export function plotPoints(series, { width, height, min, max }) {
  const last = Math.max(1, series.length - 1);
  return series.map(({ voc }, index) => ({
    index,
    x: shown(series.length === 1 ? width / 2 : (index / last) * width),
    y: Number.isFinite(voc) ? shown(height - ((voc - min) / (max - min)) * height) : null,
    value: Number.isFinite(voc) ? voc : null,
  }));
}

function pathForRun(run) {
  if (run.length === 1) return `M ${run[0].x} ${run[0].y}`;
  let path = `M ${run[0].x} ${run[0].y}`;

  for (let index = 0; index < run.length - 1; index += 1) {
    const before = run[index - 1] ?? run[index];
    const start = run[index];
    const end = run[index + 1];
    const after = run[index + 2] ?? end;
    const control1 = {
      x: shown(start.x + (end.x - before.x) / 6),
      y: shown(start.y + (end.y - before.y) / 6),
    };
    const control2 = {
      x: shown(end.x - (after.x - start.x) / 6),
      y: shown(end.y - (after.y - start.y) / 6),
    };
    path += ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`;
  }
  return path;
}

function continuousRuns(points) {
  const runs = [];
  let run = [];
  for (const point of points) {
    if (point.y === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(point);
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

export function linePaths(points) {
  return continuousRuns(points).map(pathForRun);
}

export function areaPaths(points, baseline) {
  return continuousRuns(points).map((run) => {
    const first = run[0];
    const last = run.at(-1);
    return `${pathForRun(run)} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
  });
}
