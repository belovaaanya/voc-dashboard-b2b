/**
 * Неаддитивные разрезы: `operations` → группы (`D-08`, `D-09`, `D-11`, `D-12`).
 *
 * Разрез задаётся проекцией `оценка → массив ключей`, а не списком измерений:
 * триггеры, продукты, `КП`, `problem` и `domain` считаются одним кодом, а
 * справочник триггер → продукт остаётся снаружи (`data-model` §3.2).
 *
 * Оценка с `N` ключами попадает в каждый с весом `1/N` (`D-08`), поэтому
 * `weightedCount` по группам суммируется в число оценок среза, а
 * `weightedVoc` сводится к VOC среза. `mentions` — вторая, честно названная
 * метрика с целым отнесением (`D-09`): она больше числа оценок и в сумму не
 * сходится, это свойство разреза, а не ошибка.
 *
 * Внутри группы оценка учитывается один раз: несколько триггеров одной оценки
 * могут сойтись в один продукт (`data-model` §5.2), и тогда дедупликация по
 * `voc_ccode` — единственное, что удерживает `mentions` и `voc` группы от
 * двойного счёта.
 */

import { LOW_MARK_MAX } from './metrics.js';

/** Пустая разметка — не потерянная оценка, а явная группа (`D-11`). */
export const UNLABELLED = 'Без разметки';

export function breakdown(ratings, project) {
  const groups = new Map();
  const total = ratings.length;

  for (const rating of ratings) {
    const keys = projectKeys(rating, project);
    const weight = 1 / keys.length;

    for (const key of keys) {
      const group = groupFor(groups, key);
      group.weightedCount += weight;
      group.weightedMarkSum += weight * rating.mark;

      if (group.seen.has(rating.voc_ccode)) continue;
      group.seen.add(rating.voc_ccode);
      group.mentions += 1;
      group.markSum += rating.mark;
      if (rating.mark <= LOW_MARK_MAX) group.lowCount += 1;
    }
  }

  return [...groups.values()]
    .map(({ seen, markSum, weightedMarkSum, ...group }) => ({
      ...group,
      voc: group.mentions === 0 ? null : markSum / group.mentions,
      weightedVoc:
        group.weightedCount === 0 ? null : weightedMarkSum / group.weightedCount,
      share: total === 0 ? null : (group.weightedCount * 100) / total,
    }))
    .sort(byWeightThenKey);
}

function projectKeys(rating, project) {
  const keys = (project(rating) ?? []).map((key) => (isBlank(key) ? UNLABELLED : key));
  return keys.length === 0 ? [UNLABELLED] : keys;
}

function isBlank(key) {
  return key === null || key === undefined || String(key).trim() === '';
}

function groupFor(groups, key) {
  const existing = groups.get(key);
  if (existing) return existing;

  const group = {
    key,
    mentions: 0,
    weightedCount: 0,
    lowCount: 0,
    markSum: 0,
    weightedMarkSum: 0,
    seen: new Set(),
  };
  groups.set(key, group);
  return group;
}

function byWeightThenKey(left, right) {
  if (left.weightedCount !== right.weightedCount) {
    return right.weightedCount - left.weightedCount;
  }
  if (left.key < right.key) return -1;
  return left.key > right.key ? 1 : 0;
}
