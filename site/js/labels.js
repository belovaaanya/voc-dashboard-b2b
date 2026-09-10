/*
  Человекочитаемые подписи приходят из справочника в манифесте; нет подписи —
  показываем код (D-02).
*/

export function createLabels(manifest) {
  const byDimension = new Map();
  for (const entry of manifest?.labels ?? []) {
    if (!entry?.dimension || !entry?.code || !entry?.label) continue;
    if (!byDimension.has(entry.dimension)) byDimension.set(entry.dimension, new Map());
    byDimension.get(entry.dimension).set(entry.code, entry.label);
  }
  return (dimension, code) => byDimension.get(dimension)?.get(code) ?? code;
}
