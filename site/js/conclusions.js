import { decomposeVocChange } from './impact.js';

export function buildConclusion(previous, current, project, limit = 2) {
  const decomposition = decomposeVocChange(previous, current, project);
  const positive = decomposition.contributions
    .filter(({ impact }) => impact > 0)
    .sort((left, right) => right.impact - left.impact)
    .slice(0, limit);
  const negative = decomposition.contributions
    .filter(({ impact }) => impact < 0)
    .slice(0, limit);

  return { ...decomposition, positive, negative };
}
