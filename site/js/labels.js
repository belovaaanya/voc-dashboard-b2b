/*
  Человекочитаемые подписи приходят из справочника `labels` в `reference.json`;
  нет подписи — показываем код (D-02).

  Формат: { "<измерение>": { "<код>": "<подпись>" } } (data-model §7), где
  измерение — канонический id (`channel`, `segment`, …). Русские названия из
  листа `labels` приводит к ним конвертер: словарь соответствия живёт в одном
  месте, и это не браузер (D-39).

  Пока конвертер нормализацию не выложил, справочник приходит с русскими
  ключами, измерение не находится и показывается код — ровно тот fallback,
  который задан D-02.
*/

export function createLabels(reference) {
  const byDimension = new Map();
  for (const [dimension, codes] of Object.entries(reference?.labels ?? {})) {
    byDimension.set(dimension.trim().toLowerCase(), codes);
  }
  return (dimension, code) => byDimension.get(String(dimension).trim().toLowerCase())?.[code] ?? code;
}
