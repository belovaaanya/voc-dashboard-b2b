/*
  Человекочитаемые подписи приходят из справочника `labels` в `reference.json`;
  нет подписи — показываем код (D-02).

  Формат: { "<измерение>", { "<код>": "<подпись>" } } (data-model §7). Имя
  измерения там — то, что аналитик вписал в колонку `измерение` листа `labels`,
  то есть человеческое слово («канал», «сегмент»), а не наш ключ фильтра.
  Поэтому измерения ищутся без учёта регистра и пробелов по краям: лист
  заполняется руками.
*/

export function createLabels(reference) {
  const byDimension = new Map();
  for (const [dimension, codes] of Object.entries(reference?.labels ?? {})) {
    byDimension.set(dimension.trim().toLowerCase(), codes);
  }
  return (dimension, code) => byDimension.get(String(dimension).trim().toLowerCase())?.[code] ?? code;
}
